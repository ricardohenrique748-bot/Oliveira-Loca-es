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
const CAMPO = "login-campo h-12 bg-foreground/5 backdrop-blur-sm baixa:h-11 curta:h-10";

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
    <form action={acao} onSubmit={aoEnviar} className="space-y-5 baixa:space-y-3.5 curta:space-y-2.5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Item className="space-y-2">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" required autoFocus
            placeholder="seu@email.com" className={cn(CAMPO, "pl-10")} defaultValue={estado.email} />
        </div>
      </Item>
      <Item className="space-y-2">
        <Label htmlFor="senha" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={senhaRef} id="senha" name="senha" type={verSenha ? "text" : "password"} autoComplete="current-password" required
            className={cn(CAMPO, "px-10")} placeholder="••••••••" />
          <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-1 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-90">
            {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Item>
      <Item>
        <label htmlFor="lembrar" className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Checkbox id="lembrar" name="lembrar" checked={lembrar} onCheckedChange={(v) => setLembrar(!!v)}
            />
          Lembrar e-mail
        </label>
      </Item>
      {estado.erro && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{estado.erro}</p>}
      <Item>
        <Button type="submit" className="h-12 baixa:h-11 curta:h-10 w-full rounded-full text-sm font-bold uppercase tracking-wide" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <LogIn />} Entrar
        </Button>
      </Item>
    </form>
  );
}
