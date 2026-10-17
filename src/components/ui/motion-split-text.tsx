"use client";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/** Texto que entra palavra por palavra (sobe e aparece), depois que a fonte carrega. */
export function SplitText({ text, as: Tag = "h1", className }: {
  text: string; as?: "h1" | "h2" | "h3" | "p" | "span"; className?: string;
}) {
  const [ready, setReady] = React.useState(false);
  const reduzir = useReducedMotion();
  const words = text.split(" ");

  React.useEffect(() => {
    const show = () => setReady(true);
    if (!document.fonts?.ready) return show();
    document.fonts.ready.then(show);
  }, []);

  return (
    <Tag className={className} aria-label={text} style={{ visibility: ready ? "visible" : "hidden" }}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} aria-hidden>
          <motion.span
            className="inline-block will-change-transform"
            initial={{ opacity: 0, y: 10 }}
            animate={ready ? { opacity: 1, y: 0 } : undefined}
            transition={reduzir ? { duration: 0 } : { type: "spring", duration: 2, bounce: 0, delay: index * 0.05 }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

export default SplitText;
