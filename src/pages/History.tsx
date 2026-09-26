import { useEffect, useState } from "react";
import { CalendarDays, FileText, Search, Trash2 } from "lucide-react";
import { call } from "../lib/api";
import { dateTime, duration, fullDate, number } from "../lib/format";
import type { Transcript } from "../lib/types";
import { CopyButton, Dialog, Empty, ProviderIcon } from "../components/ui";

export function History({
  revision,
  copy,
  toast,
  changed,
}: {
  revision: number;
  copy: (text: string) => void;
  toast: (text: string) => void;
  changed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [rows, setRows] = useState<Transcript[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<"all" | "one" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      call<Transcript[]>("history", { query, provider, offset: 0 })
        .then((items) => {
          if (!live) return;
          setRows(items);
          setMore(items.length === 50);
          setSelected((old) =>
            items.some((x) => x.id === old) ? old : (items[0]?.id ?? null),
          );
        })
        .catch((e) => {
          if (live) setError(String(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, provider, revision]);
  const current = rows.find((r) => r.id === selected);
  async function remove() {
    setDeleting(true);
    try {
      await call(
        confirm === "all" ? "clear_history" : "delete_transcript",
        confirm === "all" ? {} : { id: selected },
      );
      setConfirm(null);
      changed();
      toast(confirm === "all" ? "Histórico apagado." : "Transcrição excluída.");
    } catch (e) {
      toast(String(e));
    } finally {
      setDeleting(false);
    }
  }
  async function loadMore() {
    try {
      const items = await call<Transcript[]>("history", {
        query,
        provider,
        offset: rows.length,
      });
      setRows((old) => [...old, ...items]);
      setMore(items.length === 50);
    } catch (e) {
      toast(String(e));
    }
  }
  return (
    <div className="page history-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SUAS IDEIAS, GUARDADAS</div>
          <h1>Histórico</h1>
          <p>Encontre, copie e continue de onde parou.</p>
        </div>
        <button
          className="button secondary"
          disabled={!rows.length}
          onClick={() => setConfirm("all")}
        >
          <Trash2 size={15} />
          Limpar histórico
        </button>
      </div>
      <div className="history-toolbar">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Buscar no histórico"
            placeholder="Buscar uma palavra ou ideia…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrar por provedor"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="">Todos os provedores</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>
      {error ? (
        <div className="error-panel" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="loading">Carregando histórico…</div>
      ) : rows.length === 0 ? (
        <div className="history-empty">
          <Empty
            icon={<FileText size={30} />}
            title={
              query || provider
                ? "Nenhuma transcrição encontrada"
                : "Espaço para suas primeiras palavras"
            }
          >
            {query || provider
              ? "Experimente outra busca ou remova o filtro."
              : "Tudo que você transcrever fica aqui, com data, horário e provedor."}
          </Empty>
        </div>
      ) : (
        <div className="history-layout">
          <div className="history-list" aria-label="Transcrições">
            {rows.map((row) => (
              <button
                key={row.id}
                className={`history-item ${selected === row.id ? "selected" : ""}`}
                onClick={() => setSelected(row.id)}
              >
                <span className="history-item-date">
                  {dateTime(row.createdAt)}
                  <span className={`provider-dot ${row.provider}`} />
                </span>
                <p>{row.text}</p>
                <span className="small muted">
                  {row.words} palavras · {duration(row.audioSeconds)}
                </span>
              </button>
            ))}
            {more && (
              <button className="button secondary load-more" onClick={loadMore}>
                Carregar mais
              </button>
            )}
          </div>
          {current && (
            <article className="transcript-detail">
              <div className="detail-top">
                <ProviderIcon provider={current.provider} />
                <div>
                  <strong>
                    {current.provider === "openai" ? "OpenAI" : "Gemini"}
                  </strong>
                  <small>{current.model}</small>
                </div>
                <CopyButton compact onClick={() => copy(current.text)} />
              </div>
              <div className="detail-date">
                <CalendarDays size={14} />
                {fullDate(current.createdAt)}
              </div>
              <p className="transcript-text">{current.text}</p>
              <div className="detail-bottom">
                <div className="detail-metrics">
                  <span>
                    <strong>{number(current.words)}</strong> palavras
                  </span>
                  <span>
                    <strong>{duration(current.audioSeconds)}</strong> de áudio
                  </span>
                  <span>
                    <strong>{(current.latencyMs / 1000).toFixed(1)}s</strong>{" "}
                    para transcrever
                  </span>
                </div>
                <div className="section-heading">
                  <CopyButton onClick={() => copy(current.text)} />
                  <button
                    className="icon-button danger"
                    title="Excluir transcrição"
                    aria-label="Excluir transcrição"
                    onClick={() => setConfirm("one")}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      )}
      {confirm && (
        <Dialog
          title={
            confirm === "all"
              ? "Limpar o histórico?"
              : "Excluir esta transcrição?"
          }
          onClose={() => !deleting && setConfirm(null)}
        >
          <p>
            {confirm === "all"
              ? "Todos os textos serão apagados deste dispositivo. As métricas de uso das APIs serão mantidas."
              : "O texto será removido do histórico deste dispositivo."}{" "}
            Essa ação não pode ser desfeita.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </button>
            <button
              className="button destructive"
              disabled={deleting}
              onClick={remove}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
