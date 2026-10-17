"use client";
import * as React from "react";
import { MotionConfig, motion, type Variants } from "motion/react";

const palco: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const entrada: Variants = {
  oculto: { opacity: 0, y: 12 },
  visivel: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.9, bounce: 0 } },
};

/** Container da tela de login: os <Item> dentro dele entram em sequência. */
export function Palco({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="never">
      <motion.div initial="oculto" animate="visivel" variants={palco} className={className}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function Item({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div variants={entrada} className={className}>{children}</motion.div>;
}
