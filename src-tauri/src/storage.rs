use crate::model::*;
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use std::{path::Path, sync::Mutex};

pub struct Store(pub Mutex<Connection>);
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        Self::initialize(connection)
    }
    fn initialize(connection: Connection) -> Result<Self> {
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY, created_at TEXT NOT NULL, text TEXT NOT NULL,
                provider TEXT NOT NULL, model TEXT NOT NULL, language TEXT NOT NULL,
                audio_seconds REAL NOT NULL, recorded_seconds REAL NOT NULL,
                latency_ms INTEGER NOT NULL, words INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS transcripts_date ON transcripts(created_at DESC);
            CREATE TABLE IF NOT EXISTS usage (
                id TEXT PRIMARY KEY, created_at TEXT NOT NULL, provider TEXT NOT NULL,
                audio_seconds REAL NOT NULL, recorded_seconds REAL NOT NULL,
                latency_ms INTEGER NOT NULL DEFAULT 0, words INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER);
            PRAGMA user_version=1;")?;
        Ok(Self(Mutex::new(connection)))
    }
    pub fn settings(&self) -> Result<Settings> {
        let json: Option<String> = self
            .0
            .lock()
            .unwrap()
            .query_row("SELECT json FROM settings WHERE id=1", [], |r| r.get(0))
            .optional()?;
        Ok(match json {
            Some(s) => serde_json::from_str(&s)?,
            None => Settings::default(),
        })
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        settings.validate()?;
        self.0.lock().unwrap().execute("INSERT INTO settings(id,json) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET json=excluded.json", [serde_json::to_string(settings)?])?;
        Ok(())
    }
    pub fn history(&self, query: &str, provider: &str, offset: u32) -> Result<Vec<Transcript>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id,created_at,text,provider,model,language,audio_seconds,recorded_seconds,latency_ms,words
            FROM transcripts WHERE instr(lower(text),lower(?1)) > 0 AND (?2='' OR provider=?2)
            ORDER BY created_at DESC LIMIT 50 OFFSET ?3")?;
        let records = stmt
            .query_map(params![query, provider, offset], |r| {
                Ok(Transcript {
                    id: r.get(0)?,
                    created_at: r.get(1)?,
                    text: r.get(2)?,
                    provider: r.get(3)?,
                    model: r.get(4)?,
                    language: r.get(5)?,
                    audio_seconds: r.get(6)?,
                    recorded_seconds: r.get(7)?,
                    latency_ms: r.get(8)?,
                    words: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records)
    }
    pub fn start_usage(&self, id: &str, s: &Settings, audio: f64, recorded: f64) -> Result<()> {
        self.0.lock().unwrap().execute("INSERT INTO usage(id,created_at,provider,audio_seconds,recorded_seconds,status) VALUES(?1,?2,?3,?4,?5,'pending')",
            params![id,chrono::Utc::now().to_rfc3339(),s.provider,audio,recorded])?;
        Ok(())
    }
    pub fn finish_usage(
        &self,
        id: &str,
        status: &str,
        latency: u64,
        words: usize,
        usage: &Usage,
    ) -> Result<()> {
        self.0.lock().unwrap().execute("UPDATE usage SET status=?2,latency_ms=?3,words=?4,input_tokens=?5,output_tokens=?6 WHERE id=?1",
            params![id,status,latency,words,usage.input,usage.output])?;
        Ok(())
    }
    pub fn insert(&self, t: &Transcript) -> Result<()> {
        self.0.lock().unwrap().execute(
            "INSERT INTO transcripts VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                t.id,
                t.created_at,
                t.text,
                t.provider,
                t.model,
                t.language,
                t.audio_seconds,
                t.recorded_seconds,
                t.latency_ms,
                t.words
            ],
        )?;
        Ok(())
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        self.0
            .lock()
            .unwrap()
            .execute("DELETE FROM transcripts WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn clear(&self) -> Result<()> {
        self.0
            .lock()
            .unwrap()
            .execute_batch("DELETE FROM transcripts; PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }
    pub fn stats(&self) -> Result<Vec<ProviderStats>> {
        let conn = self.0.lock().unwrap();
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(30)).to_rfc3339();
        let mut stmt = conn.prepare("SELECT provider,COUNT(*),SUM(status='success'),SUM(status='error'),SUM(audio_seconds),SUM(recorded_seconds),SUM(words),
            COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),SUM(input_tokens IS NOT NULL OR output_tokens IS NOT NULL),
            COALESCE(AVG(CASE WHEN status='success' THEN latency_ms END),0) FROM usage WHERE created_at >= ?1 GROUP BY provider")?;
        let values = stmt
            .query_map([cutoff], |r| {
                Ok(ProviderStats {
                    provider: r.get(0)?,
                    requests: r.get(1)?,
                    successes: r.get(2)?,
                    failures: r.get(3)?,
                    audio_seconds: r.get(4)?,
                    recorded_seconds: r.get(5)?,
                    words: r.get(6)?,
                    input_tokens: r.get(7)?,
                    output_tokens: r.get(8)?,
                    token_reports: r.get(9)?,
                    average_latency_ms: r.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }
}

pub fn key_entry(provider: &str) -> Result<keyring::Entry> {
    anyhow::ensure!(
        ["openai", "gemini"].contains(&provider),
        "Provedor inválido."
    );
    Ok(keyring::Entry::new("io.github.typeper.Typeper", provider)?)
}
pub fn get_key(provider: &str) -> Result<String> {
    key_entry(provider)?.get_password().map_err(|_| {
        anyhow::anyhow!(
            "Adicione a chave de {} nas configurações e desbloqueie o chaveiro do sistema.",
            provider
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metrics_survive_history_deletion_and_query_is_literal() {
        let store = Store::initialize(Connection::open_in_memory().unwrap()).unwrap();
        let t = Transcript {
            id: "a".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
            text: "100% pronto".into(),
            provider: "openai".into(),
            model: "gpt-transcribe".into(),
            language: "auto".into(),
            audio_seconds: 1.,
            recorded_seconds: 2.,
            latency_ms: 10,
            words: 2,
        };
        store.insert(&t).unwrap();
        store
            .start_usage("a", &Settings::default(), 1., 2.)
            .unwrap();
        store
            .finish_usage("a", "success", 10, 2, &Usage::default())
            .unwrap();
        assert_eq!(store.history("%", "", 0).unwrap().len(), 1);
        assert!(store.history("' OR 1=1 --", "", 0).unwrap().is_empty());
        store.clear().unwrap();
        assert!(store.history("", "", 0).unwrap().is_empty());
        assert_eq!(store.stats().unwrap()[0].words, 2);
    }
}
