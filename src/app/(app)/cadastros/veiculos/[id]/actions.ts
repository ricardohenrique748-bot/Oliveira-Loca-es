"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";

export async function atualizarFotoVeiculo(id: string, ref: string) {
  return executar(async () => {
    await exigirEscrita("veiculos");
    const foto = z.string().regex(/^fotos\//).parse(ref);
    const supabase = await createClient();
    checar(await supabase.from("veiculos").update({ foto_url: foto }).eq("id", id));
    return null;
  }, [`/cadastros/veiculos/${id}`], "Foto atualizada");
}
