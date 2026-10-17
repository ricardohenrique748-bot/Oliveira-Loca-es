import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Label } from "@/components/ui/basicos";
import { cn } from "@/lib/utils";
import { entrar, type EstadoLogin } from "./actions";
import { Item } from "./animacao";

const CHAVE_EMAIL = "login:email";
const CAMPO = "login-campo h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-neutral-600 transition-colors hover:border-white/20 focus-visible:border-brand-yellow focus-visible:ring-brand-yellow/25 focus-visible:ring-offset-0";

export function LoginForm({ next }: { next?: string }) {
  const navigate = useNavigate();
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});
  const [lembrar, setLembrar] = useState(true);
  const [verSenha, setVerSenha] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado?.sucesso) {
      navigate(estado.next || "/dashboard", { replace: true });
    }
  }, [estado, navigate]);

  // e-mail salvo neste dispositivo: preenche e já foca a senha
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_EMAIL);
      if (salvo && emailRef.current && !emailRef.current.value) {
        emailRef.current.value = salvo;
        senhaRef.current?.focus();
      } else if (salvo === null && localStorage.getItem(`${CHAVE_EMAIL}:off`)) {
        setLembrar(false);
      }
    } catch {
      // armazenamento bloqueado: segue sem lembrar
    }
  }, []);

  function aoEnviar() {
    try {
      const email = emailRef.current?.value.trim() ?? "";
      if (lembrar && email) {
        localStorage.setItem(CHAVE_EMAIL, email);
        localStorage.removeItem(`${CHAVE_EMAIL}:off`);
      } else {
        localStorage.removeItem(CHAVE_EMAIL);
        localStorage.setItem(`${CHAVE_EMAIL}:off`, "1");
      }
    } catch {
      // ignora
    }
  }

  return (
    <form action={acao} onSubmit={aoEnviar} className="space-y-5 [@media(max-height:800px)]:space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Item className="space-y-2">
        <Label htmlFor="email" className="text-neutral-300">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" required autoFocus
            placeholder="voce@empresa.com.br" className={cn(CAMPO, "pl-10")} defaultValue={estado.email} />
        </div>
      </Item>
      <Item className="space-y-2">
        <Label htmlFor="senha" className="text-neutral-300">Senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
          <Input ref={senhaRef} id="senha" name="senha" type={verSenha ? "text" : "password"} autoComplete="current-password" required
            className={cn(CAMPO, "px-10")} />
          <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/40">
            {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Item>
      <Item>
        <label htmlFor="lembrar" className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-400">
          <Checkbox id="lembrar" name="lembrar" checked={lembrar} onCheckedChange={(v) => setLembrar(!!v)}
            className="border-neutral-600" />
          Lembrar de mim
        </label>
      </Item>
      {estado.erro && <p role="alert" className="text-sm text-red-400">{estado.erro}</p>}
      <Item>
        <Button type="submit" className="h-11 w-full font-semibold transition-transform active:scale-[0.98]" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <LogIn />} Entrar
        </Button>
      </Item>
    </form>
  );
}
