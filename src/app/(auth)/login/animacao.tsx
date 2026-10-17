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

/** Linha amarela que se desenha do centro para as pontas. */
export function Traco() {
  return (
    <motion.div
      aria-hidden
      className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-brand-yellow to-transparent"
      variants={{ oculto: { scaleX: 0, opacity: 0 }, visivel: { scaleX: 1, opacity: 1, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } } }}
    />
  );
}

function Roda({ x }: { x: number }) {
  return (
    <g className="login-roda">
      <circle cx={x} cy={81} r={11} className="fill-brand-black" strokeWidth={3} />
      <circle cx={x} cy={81} r={4} />
      <path d={`M${x} 72V77M${x} 85V90M${x - 9} 81H${x - 4}M${x + 4} 81H${x + 9}`} strokeWidth={2} />
    </g>
  );
}

/** Estrada no rodapé com um caminhão guindaste atravessando a tela em loop. */
export function Estrada() {
  return (
    <div aria-hidden className="pointer-events-none relative h-28 w-full shrink-0 overflow-hidden [@media(max-height:800px)]:h-20 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div className="absolute inset-x-0 bottom-10 border-t border-neutral-800 [@media(max-height:800px)]:bottom-7" />
      <div className="absolute inset-x-0 bottom-5 h-[2px] [@media(max-height:800px)]:bottom-3 [background-image:repeating-linear-gradient(to_right,rgb(245_217_10/0.35)_0_24px,transparent_24px_56px)]" />
      <div className="login-caminhao absolute bottom-[38px] left-0 w-60 [@media(max-height:800px)]:bottom-[26px] [@media(max-height:800px)]:w-48">
        <svg viewBox="0 0 240 94" className="w-full stroke-brand-yellow" fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
          {/* rastro de velocidade */}
          <path d="M2 48H16M6 58H20M0 68H14" className="login-rastro" strokeWidth={2} />
          <g className="login-chassi">
            {/* lança apoiada sobre a cabine */}
            <path d="M100 48L104 40L226 30L228 36Z" className="fill-brand-black" />
            <path d="M227 36V47M224 47H230L227 52Z" strokeWidth={2} />
            {/* torre e cabine do operador */}
            <path d="M90 62V46H132V62Z" className="fill-brand-black" />
            <path d="M134 62V44H149L156 54V62Z" className="fill-brand-black" />
            <path d="M138 48H147L151 54H138Z" className="fill-brand-yellow/25" strokeWidth={1.5} />
            {/* chassi */}
            <path d="M24 62H214V71H24Z" className="fill-brand-black" />
            {/* cabine do motorista */}
            <path d="M182 71V36Q182 32 186 32H206L222 52V71Z" className="fill-brand-black" />
            <path d="M188 38H204L215 52H188Z" className="fill-brand-yellow/25" strokeWidth={1.5} />
            <path d="M220 62H226V71H220Z" className="fill-brand-black" />
            <path d="M217 56H222" strokeWidth={3} />
          </g>
          <Roda x={52} />
          <Roda x={80} />
          <Roda x={196} />
        </svg>
      </div>
    </div>
  );
}
