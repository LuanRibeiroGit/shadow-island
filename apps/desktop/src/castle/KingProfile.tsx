import { useEffect, useRef, useState } from "react";
import { KING_DEFAULT_NAME, KING_KEY, kingName } from "@ids/game-engine";
import { useCharacters } from "../stores/characters";
import { Modal } from "../components/Modal";
import { loadImage, loadManifest } from "../characters/sprites";

interface KingSheet {
  image: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number }>;
}

/** The King's sprite, animated, on a 2D canvas. */
export function KingPortrait({ size = 96, animation = "idle" }: { size?: number; animation?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), 220);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await loadManifest();
      const sheet = (m.environments as unknown as Record<string, KingSheet | undefined>).king;
      if (!sheet) return;
      const img = await loadImage(sheet.image);
      const c = ref.current;
      if (cancelled || !c) return;
      const a = sheet.animations[animation] ?? sheet.animations.idle;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (frame % (a?.frames ?? 1)) * sheet.frameWidth, (a?.row ?? 0) * sheet.frameHeight, sheet.frameWidth, sheet.frameHeight, 0, 0, c.width, c.height);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [animation, frame]);
  return <canvas ref={ref} width={32} height={32} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-label="Retrato do Rei" />;
}

/** The King's name: the one thing about him the user can change. */
export function KingNameField() {
  const custom = useCharacters((s) => s.custom);
  const save = useCharacters((s) => s.save);
  const own = custom[KING_KEY] ?? {};
  return (
    <label className="field">
      <span>Nome</span>
      <input
        className="input"
        aria-label="Nome do Rei"
        defaultValue={own.name ?? ""}
        placeholder={KING_DEFAULT_NAME}
        maxLength={40}
        onBlur={(e) => void save(KING_KEY, { ...own, name: e.target.value.trim() || undefined })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
}

/** Profile of the King, opened by clicking him in the castle. */
export function KingProfile({ doing, onClose }: { doing: () => string | null; onClose: () => void }) {
  const custom = useCharacters((s) => s.custom);
  // Keeps "what he is doing" fresh while the sheet is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <Modal title={kingName(custom)} onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <div className="profile" data-testid="king-profile">
        <section>
          <div className="row" style={{ flexWrap: "nowrap", gap: 14 }}>
            <KingPortrait />
            <div style={{ minWidth: 0 }}>
              <div>Senhor do castelo</div>
              <div className="faint" style={{ fontSize: 12 }}>Personagem da ilha. Não é um agente do Claude Code e não gera atividade, tokens nem custo.</div>
            </div>
          </div>
          <h4>Agora</h4>
          <dl className="profile-now">
            <dt className="faint">No castelo</dt>
            <dd>{doing() ?? "—"}</dd>
          </dl>
        </section>
        <section style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <KingNameField />
        </section>
      </div>
    </Modal>
  );
}
