import {
  ArrowDownLeft,
  ArrowRight,
  AudioLines,
  Check,
  Clock3,
  FileText,
  Keyboard,
  Mic,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { CopyButton, Empty, ProviderIcon, Shortcut } from "../components/ui";
import { dateTime, duration, number, silenceSaved } from "../lib/format";
import type {
  KeyStatus,
  Page,
  Provider,
  ProviderStats,
  Settings,
  Transcript,
} from "../lib/types";

interface Props {
  settings: Settings;
  keys: KeyStatus;
  stats: ProviderStats[];
  recent: Transcript[];
  page: (page: Page) => void;
  copy: (text: string) => void;
  action: () => void;
  busy: boolean;
}
export function Activity({
  settings,
  keys,
  stats,
  recent,
  page,
  copy,
  action,
  busy,
}: Props) {
  const sum = (
    key: "successes" | "words" | "audioSeconds" | "recordedSeconds",
  ) => stats.reduce((n, s) => n + s[key], 0);
  const connected = keys[settings.provider].saved;
  return (
    <div className="page activity-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE DITADO</div>
          <h1>Sua voz, onde você escreve.</h1>
          <p>Uma ideia falada. Um texto pronto para usar.</p>
        </div>
        <span className="period">
          <Clock3 size={14} />
          Últimos 30 dias
        </span>
      </div>
      <section className="hero">
        <div className="hero-content">
          <span className="hero-status">
            <i />
            {connected ? "Tudo pronto para começar" : "Vamos começar"}
          </span>
          <h2>
            Menos teclado.
            <br />
            Mais fluidez.
          </h2>
          <p>
            {connected
              ? "Use o atalho, fale e siga com o seu dia."
              : "Conecte sua API e transforme sua voz em texto."}
          </p>
          <div className="hero-actions">
            <button
              className="button mint"
              disabled={busy}
              onClick={connected ? action : () => page("settings")}
            >
              {connected ? <Mic size={17} /> : <ArrowRight size={17} />}{" "}
              {connected ? "Iniciar ditado" : "Conectar uma API"}
            </button>
            <Shortcut value={settings.shortcut} />
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={13} />O áudio só é enviado quando você confirma.
          </div>
        </div>
        <div className="voice-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="voice-core">
            <AudioLines size={62} strokeWidth={1.4} />
          </div>
          <span className="art-badge voice-badge">
            <Mic size={13} />
            sua voz
          </span>
          <span className="art-badge text-badge">
            <Check size={13} />
            texto pronto
          </span>
          <div className="orbit-dot" />
        </div>
      </section>
      <section className="metrics" aria-label="Métricas de uso">
        {[
          {
            icon: <FileText size={18} />,
            value: number(sum("successes")),
            label: "Transcrições",
            detail: "ideias que viraram texto",
          },
          {
            icon: <AudioLines size={18} />,
            value: duration(sum("audioSeconds")),
            label: "Áudio enviado",
            detail: "somando os dois provedores",
          },
          {
            icon: <Keyboard size={18} />,
            value: number(sum("words")),
            label: "Palavras",
            detail: "registradas nas transcrições",
          },
          {
            icon: <Scissors size={18} />,
            value: `${silenceSaved(sum("recordedSeconds"), sum("audioSeconds"))}%`,
            label: "Silêncio removido",
            detail: "menos áudio em cada envio",
          },
        ].map((metric) => (
          <article className="metric" key={metric.label}>
            <div className="metric-label">
              {metric.label}
              {metric.icon}
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>
      <div className="section-heading">
        <h2>Uso por provedor</h2>
        <span className="muted small">Apenas o uso neste aplicativo</span>
      </div>
      <section className="providers-grid">
        {(["openai", "gemini"] as Provider[]).map((provider) => {
          const s = stats.find((s) => s.provider === provider);
          const active = settings.provider === provider;
          return (
            <article className="provider-card" key={provider}>
              <div className="provider-heading">
                <ProviderIcon provider={provider} />
                <div>
                  <h3>{provider === "openai" ? "OpenAI" : "Gemini"}</h3>
                  <small>
                    {provider === "openai"
                      ? settings.openaiModel
                      : settings.geminiModel}
                  </small>
                </div>
                <span className={`badge ${active ? "active-badge" : ""}`}>
                  {active ? "Em uso" : "Alternativa"}
                </span>
              </div>
              <div className="provider-numbers">
                <div>
                  <strong>{number(s?.requests ?? 0)}</strong>
                  <span>envios</span>
                </div>
                <div>
                  <strong>{duration(s?.audioSeconds ?? 0)}</strong>
                  <span>de áudio</span>
                </div>
                <div>
                  <strong>
                    {s?.tokenReports
                      ? number(s.inputTokens + s.outputTokens)
                      : "—"}
                  </strong>
                  <span>tokens reportados</span>
                </div>
              </div>
              <div className="provider-footer">
                <span className={keys[provider].saved ? "connected" : "muted"}>
                  <i />
                  {keys[provider].saved
                    ? "Chave adicionada"
                    : "Sem chave de API"}
                </span>
                <button className="text-link" onClick={() => page("settings")}>
                  Configurar
                  <ArrowRight size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </section>
      <div className="section-heading">
        <h2>Última transcrição</h2>
        <button className="text-link" onClick={() => page("history")}>
          Ver histórico
          <ArrowRight size={14} />
        </button>
      </div>
      <section className="recent-card">
        {recent[0] ? (
          <>
            <div className="recent-meta">
              <span>
                <ArrowDownLeft size={15} />
                {dateTime(recent[0].createdAt)}
                <span className="dot-separator">·</span>
                {recent[0].provider === "openai" ? "OpenAI" : "Gemini"}
              </span>
              <CopyButton compact onClick={() => copy(recent[0].text)} />
            </div>
            <p>{recent[0].text}</p>
            <small>
              {recent[0].words} palavras · {duration(recent[0].audioSeconds)} de
              áudio
            </small>
          </>
        ) : (
          <Empty
            icon={<FileText size={23} />}
            title="Sua próxima ideia começa aqui"
          >
            Depois do primeiro ditado, você encontra o texto aqui e no
            histórico.
          </Empty>
        )}
      </section>
    </div>
  );
}
