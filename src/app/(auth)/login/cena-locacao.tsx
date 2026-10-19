"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Etapas do ciclo de uma locação; a cena avança de uma para a outra em loop. */
const FASES = [
  { status: "Disponível no pátio", cor: "bg-white/70", x: 0, olhaDireita: true, braco: false, dias: 0, etapa: -1, ms: 1800 },
  { status: "Retirada · a caminho da obra", cor: "bg-primary", x: 1, olhaDireita: true, braco: false, dias: 0, etapa: 0, ms: 2600 },
  { status: "Locado · em operação na obra", cor: "bg-green-400", x: 1, olhaDireita: true, braco: true, dias: 30, etapa: 1, ms: 3400 },
  { status: "Medição faturada · R$ 18.000,00", cor: "bg-primary", x: 1, olhaDireita: true, braco: false, dias: 30, etapa: 1, ms: 2000 },
  { status: "Devolução · voltando ao pátio", cor: "bg-primary", x: 0, olhaDireita: false, braco: false, dias: 30, etapa: 2, ms: 2600 },
  { status: "Recebido ✓ · repasse liberado", cor: "bg-green-400", x: 0, olhaDireita: true, braco: false, dias: 30, etapa: 2, ms: 2200 },
] as const;
const ETAPAS = ["Retirada", "Locação", "Devolução"];

/** Caminhão munck (guindauto) de perfil, virado para a direita; o braço sobe quando `braco` é verdadeiro. */
function Munck({ braco, andando }: { braco: boolean; andando: boolean }) {
  return (
    <svg viewBox="0 -28 160 94" className="w-full stroke-primary overflow-visible" fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {/* carroceria e chassi */}
      <path d="M12 36H98V44H12Z" className="fill-brand-black" />
      <path d="M8 44H150V52H8Z" className="fill-brand-black" />
      {/* coluna do guindaste */}
      <path d="M100 44V26H110V44Z" className="fill-brand-black" />
      {/* braço: gira em torno do topo da coluna */}
      <g className="transition-transform duration-700 ease-in-out" style={{ transformOrigin: "105px 28px", transform: braco ? "rotate(30deg)" : "rotate(0deg)" }}>
        <path d="M105 25L20 21V27L105 32Z" className="fill-brand-black" />
        <g className="transition-transform duration-700 ease-in-out" style={{ transformOrigin: "22px 27px", transform: braco ? "rotate(-30deg)" : "rotate(0deg)" }}>
          <path d="M22 27V38M18 38H26L22 43Z" strokeWidth={2} />
        </g>
      </g>
      {/* cabine */}
      <path d="M116 52V24Q116 20 120 20H136L150 36V52Z" className="fill-brand-black" />
      <path d="M121 25H134L144 36H121Z" className="fill-primary/25" strokeWidth={1.5} />
      <path d="M146 44H151" strokeWidth={3} />
      {/* rodas */}
      {[32, 52, 132].map((x) => (
        <g key={x} className={cn(andando && "login-roda")} style={{ transformOrigin: `${x}px 54px` }}>
          <circle cx={x} cy={54} r={8} className="fill-brand-black" />
          <circle cx={x} cy={54} r={3} />
          <path d={`M${x} 47V50M${x} 58V61M${x - 7} 54H${x - 4}M${x + 4} 54H${x + 7}`} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

function Patio() {
  return (
    <svg viewBox="0 0 72 62" className="w-full stroke-white/35" fill="none" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d="M4 26L36 8L68 26V60H4Z" className="fill-white/[0.03]" />
      <path d="M16 60V34H56V60M16 40H56M16 46H56M16 52H56" strokeWidth={1.5} />
    </svg>
  );
}

function Obra() {
  return (
    <svg viewBox="0 0 96 86" className="w-full stroke-white/35" fill="none" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      {/* grua */}
      <path d="M70 84V12M64 84V12M64 12H70M64 24H70M64 40H70M64 56H70M64 72H70M16 12H92M70 12L80 4L92 12M30 12V24" strokeWidth={1.5} />
      <path d="M27 24H33V29H27Z" className="fill-white/10" strokeWidth={1.5} />
      {/* prédio em construção */}
      <path d="M8 84V44H52V84M8 58H52M8 72H52M22 44V84M37 44V84" strokeWidth={1.5} className="fill-white/[0.03]" />
    </svg>
  );
}

export function CenaLocacao() {
  const [fase, setFase] = React.useState(0);
  const [reduzido, setReduzido] = React.useState(false);
  const [dia, setDia] = React.useState(0);

  React.useEffect(() => {
    setReduzido(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  React.useEffect(() => {
    const t = setTimeout(() => setFase((f) => (f + 1) % FASES.length), FASES[fase].ms);
    return () => clearTimeout(t);
  }, [fase]);

  // contador de dias acompanha a barra durante a operação na obra
  React.useEffect(() => {
    if (fase === 0) { setDia(0); return; }
    if (fase !== 2) return;
    if (reduzido) { setDia(30); return; }
    const passo = (FASES[2].ms - 400) / 30;
    const t = setInterval(() => setDia((d) => (d >= 30 ? d : d + 1)), passo);
    return () => clearInterval(t);
  }, [fase, reduzido]);

  const f = FASES[fase];
  const andando = fase === 1 || fase === 4;
  const viagem = reduzido ? "0ms" : `${FASES[1].ms - 200}ms`;

  return (
    <div className="w-full max-w-sm">
      {/* cartão do contrato, acompanha a cena */}
      <div className="mx-auto w-fit min-w-64 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-lg shadow-black/30 backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Contrato 0427 · GPA-8K56</p>
        <p key={fase} className="mt-1 flex animate-fade-in-up items-center gap-2 text-sm font-semibold" aria-live="polite">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", f.cor)} aria-hidden />{f.status}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary ease-linear" style={{
              width: `${(f.dias / 30) * 100}%`,
              transition: fase === 0 ? "none" : `width ${reduzido ? 0 : FASES[2].ms - 400}ms linear`,
            }} />
          </div>
          <span className="num w-14 text-right text-[10px] text-white/50">{dia}/30 dias</span>
        </div>
      </div>

      {/* cena: pátio ← estrada → obra */}
      <div className="relative mt-8 h-48 [--caminhao:11rem] baixa:mt-5 baixa:h-40 curta:mt-3 curta:h-28 curta:[--caminhao:8rem]">
        <div className="absolute bottom-3 left-0 w-24 curta:w-16"><Patio /></div>
        <div className="absolute bottom-3 right-0 w-28 curta:w-20"><Obra /></div>
        <p className="absolute -bottom-3 left-0 w-24 curta:w-16 text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Pátio</p>
        <p className="absolute -bottom-3 right-0 w-28 curta:w-20 text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Obra</p>
        {/* estrada */}
        <div className="absolute inset-x-0 bottom-3 border-t border-white/15" />
        <div className={cn("absolute inset-x-0 bottom-1 h-[2px] [background-image:repeating-linear-gradient(to_right,rgb(252_229_1/0.35)_0_14px,transparent_14px_30px)] [background-size:30px_2px]", andando && !reduzido && "login-estrada")} />
        {/* caminhão */}
        <div className="absolute bottom-[10px] w-[var(--caminhao)] overflow-visible"
          style={{ left: f.x ? "calc(100% - var(--caminhao) - 2.5rem)" : "2.5rem", transition: `left ${viagem} cubic-bezier(0.45, 0, 0.25, 1)` }}>
          <div className="transition-transform duration-300 overflow-visible" style={{ transform: f.olhaDireita ? "scaleX(1)" : "scaleX(-1)" }}>
            <div className={cn("overflow-visible", andando && !reduzido && "login-chassi")}><Munck braco={f.braco} andando={andando && !reduzido} /></div>
          </div>
        </div>
      </div>

      {/* etapas */}
      <ol className="mt-8 baixa:mt-6 curta:mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
        {ETAPAS.map((e, i) => (
          <li key={e} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className={cn("h-px w-6 transition-colors duration-500", f.etapa >= i ? "bg-primary" : "bg-white/15")} />}
            <span className={cn("rounded-full px-2.5 py-1 transition-colors duration-500",
              f.etapa === i ? "bg-primary text-primary-foreground" : f.etapa > i ? "text-primary" : "text-white/40")}>{e}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
