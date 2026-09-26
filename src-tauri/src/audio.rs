use crate::model::{Microphone, Settings};
use anyhow::{Context, Result};
use std::{
    collections::VecDeque,
    io::{Cursor, Read},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread::JoinHandle,
};
use webrtc_vad::{SampleRate, Vad, VadMode};

pub const RATE: usize = 16_000;
const FRAME: usize = 320; // 20 ms at 16 kHz
const PRE_ROLL: usize = 10; // 200 ms before speech
const HANGOVER: usize = 25; // 500 ms after speech
const MAX_SAMPLES: usize = RATE * 300; // explicit confirmation still required at limit

#[derive(Default)]
pub struct AudioBuffer {
    pub pcm: Vec<i16>,
    pub total: usize,
    pub voice_frames: usize,
    pub paused: bool,
    pub level: f64,
    pub ended: bool,
    pub error: Option<String>,
}
pub struct Capture {
    child: Child,
    thread: Option<JoinHandle<()>>,
    pub buffer: Arc<Mutex<AudioBuffer>>,
}

// Padding is a separate deterministic component so cuts can be tested without a microphone.
pub struct Gate {
    pre: VecDeque<Vec<i16>>,
    hangover: usize,
    trim: bool,
}
impl Gate {
    pub fn new(trim: bool) -> Self {
        Self {
            pre: VecDeque::new(),
            hangover: 0,
            trim,
        }
    }
    pub fn push(&mut self, frame: &[i16], speech: bool, output: &mut Vec<i16>) -> bool {
        if !self.trim {
            output.extend_from_slice(frame);
            return false;
        }
        if speech {
            for p in self.pre.drain(..) {
                output.extend(p);
            }
            self.hangover = HANGOVER;
            output.extend_from_slice(frame);
            false
        } else if self.hangover > 0 {
            self.hangover -= 1;
            output.extend_from_slice(frame);
            false
        } else {
            self.pre.push_back(frame.to_vec());
            if self.pre.len() > PRE_ROLL {
                self.pre.pop_front();
            }
            true
        }
    }
}

impl Capture {
    pub fn start(settings: &Settings) -> Result<Self> {
        let mut command = Command::new("parec");
        command.args([
            "--raw",
            "--format=s16le",
            "--rate=16000",
            "--channels=1",
            "--latency-msec=20",
            "--client-name=Typeper",
        ]);
        if settings.microphone != "default" {
            command.arg(format!("--device={}", settings.microphone));
        }
        let mut child = command.stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
            .context("Não foi possível abrir o microfone. Instale pulseaudio-utils e verifique o serviço de áudio.")?;
        let mut stdout = child
            .stdout
            .take()
            .context("Não foi possível ler o microfone.")?;
        let buffer = Arc::new(Mutex::new(AudioBuffer::default()));
        let shared = buffer.clone();
        let trim = settings.trim_silence;
        let mode = settings.vad_mode;
        let thread = std::thread::spawn(move || {
            let mode = match mode {
                0 => VadMode::Quality,
                1 => VadMode::LowBitrate,
                2 => VadMode::Aggressive,
                _ => VadMode::VeryAggressive,
            };
            let mut vad = Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, mode);
            let mut gate = Gate::new(trim);
            let mut bytes = [0u8; FRAME * 2];
            loop {
                if stdout.read_exact(&mut bytes).is_err() {
                    let mut b = shared.lock().unwrap();
                    b.ended = true;
                    b.error = Some("A captura de áudio foi interrompida. Verifique o microfone; o trecho já gravado pode ser enviado.".into());
                    break;
                }
                let frame: Vec<i16> = bytes
                    .chunks_exact(2)
                    .map(|x| i16::from_le_bytes([x[0], x[1]]))
                    .collect();
                let speech = vad.is_voice_segment(&frame).unwrap_or(false);
                let rms = (frame
                    .iter()
                    .map(|x| (*x as f64 / 32768.).powi(2))
                    .sum::<f64>()
                    / FRAME as f64)
                    .sqrt();
                let mut b = shared.lock().unwrap();
                b.total += FRAME;
                if speech {
                    b.voice_frames += 1;
                }
                b.level = (rms * 8.).min(1.);
                b.paused = gate.push(&frame, speech, &mut b.pcm);
                if b.total >= MAX_SAMPLES {
                    b.ended = true;
                    break;
                }
            }
        });
        Ok(Self {
            child,
            thread: Some(thread),
            buffer,
        })
    }
    pub fn stop(mut self) -> Result<RecordedAudio> {
        self.shutdown();
        let b = self.buffer.lock().unwrap();
        anyhow::ensure!(
            b.voice_frames >= 3,
            "Nenhuma fala detectada. Nada foi enviado."
        );
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = hound::WavWriter::new(
                &mut cursor,
                hound::WavSpec {
                    channels: 1,
                    sample_rate: RATE as u32,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )?;
            for sample in &b.pcm {
                writer.write_sample(*sample)?;
            }
            writer.finalize()?;
        }
        Ok(RecordedAudio {
            wav: cursor.into_inner(),
            seconds: b.pcm.len() as f64 / RATE as f64,
            recorded_seconds: b.total as f64 / RATE as f64,
        })
    }
    fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Clone)]
pub struct RecordedAudio {
    pub wav: Vec<u8>,
    pub seconds: f64,
    pub recorded_seconds: f64,
}

pub fn microphones() -> Result<Vec<Microphone>> {
    let output = Command::new("pactl")
        .args(["--format=json", "list", "sources"])
        .output()
        .context("Instale pulseaudio-utils para listar microfones.")?;
    anyhow::ensure!(output.status.success(), "O serviço de áudio não respondeu.");
    let sources: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)?;
    let mut devices = vec![Microphone {
        id: "default".into(),
        name: "Padrão do sistema".into(),
    }];
    for source in sources {
        if let Some(id) = source["name"].as_str() {
            if id.ends_with(".monitor") {
                continue;
            }
            devices.push(Microphone {
                id: id.into(),
                name: source["description"].as_str().unwrap_or(id).into(),
            });
        }
    }
    Ok(devices)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trims_long_pauses_but_preserves_edges_without_duplicate_samples() {
        let mut gate = Gate::new(true);
        let mut pcm = Vec::new();
        for i in 0..100 {
            gate.push(&[i], false, &mut pcm);
        }
        assert!(pcm.is_empty());
        gate.push(&[100], true, &mut pcm);
        assert_eq!(pcm, (90..=100).collect::<Vec<_>>());
        for i in 101..=140 {
            gate.push(&[i], false, &mut pcm);
        }
        assert_eq!(pcm.last(), Some(&125));
        gate.push(&[141], true, &mut pcm);
        assert_eq!(&pcm[36..], &(131..=141).collect::<Vec<_>>());
    }
    #[test]
    fn disabled_trimming_keeps_every_frame() {
        let mut gate = Gate::new(false);
        let mut pcm = Vec::new();
        gate.push(&[1, 2], false, &mut pcm);
        gate.push(&[3, 4], true, &mut pcm);
        assert_eq!(pcm, vec![1, 2, 3, 4]);
    }
}
