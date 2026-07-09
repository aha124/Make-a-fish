import { CAPTION, CORNER_MARK } from "@/lib/constants";

// The shared shell: the blue field, the thin white box, the optional corner
// mark, and the serif caption. Children are drawn inside the box.
export default function FishFrame({ children }: { children?: React.ReactNode }) {
  return (
    <main className="field">
      <div className="box">
        {CORNER_MARK ? <span className="corner-mark">{CORNER_MARK}</span> : null}
        {children}
      </div>
      <p className="caption">{CAPTION}</p>
    </main>
  );
}
