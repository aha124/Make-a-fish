import { CAPTION, CORNER_MARK } from "@/lib/constants";

// The shared shell: the blue field, the thin white box, the optional corner
// mark, and the serif caption. Children are drawn inside the box. Anything
// passed as `footer` (buttons, countdown, links) renders inside the same
// full-height field, below the caption, so the whole thing is one column that
// can be sized to the viewport instead of spilling past the fold on mobile.
export default function FishFrame({
  children,
  footer,
}: {
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="field">
      <div className="box">
        {CORNER_MARK ? <span className="corner-mark">{CORNER_MARK}</span> : null}
        {children}
      </div>
      <p className="caption">{CAPTION}</p>
      {footer}
    </main>
  );
}
