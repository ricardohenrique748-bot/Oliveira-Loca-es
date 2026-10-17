import { WifiOff } from "lucide-react";

export default function Offline() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-black p-6 text-center text-white">
      <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="h-24 w-auto" />
      <WifiOff className="h-10 w-10 text-brand-yellow" aria-hidden />
      <h1 className="text-2xl text-brand-yellow">Sem conexão</h1>
      <p className="max-w-sm text-sm text-neutral-300">Verifique a internet e tente novamente. Os dados do sistema precisam de conexão para ficarem atualizados.</p>
    </main>
  );
}
