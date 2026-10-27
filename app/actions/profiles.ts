"use server";

import { redirect } from "next/navigation";
import { clonePersona } from "@/lib/clone";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

/** Copies a persona template into the visitor's workspace and opens it. */
export async function openPersona(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "");
  const next = String(formData.get("next") ?? "profile");
  const workspaceId = await getWorkspaceId();
  if (!(await allow(`clone:${workspaceId}`, 30, 3600))) throw new Error("Too many copies this hour");
  const id = await clonePersona(templateId, workspaceId);
  if (next === "session") {
    const { data } = await db().from("sessions").select("id").eq("profile_id", id).is("started_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) redirect(`/s/${data.id}`);
  }
  redirect(`/p/${id}`);
}

/** Facility mode helper: copies every example persona into the visitor's workspace. */
export async function addExampleResidents() {
  const workspaceId = await getWorkspaceId();
  if (!(await allow(`clone:${workspaceId}`, 30, 3600))) throw new Error("Too many copies this hour");
  const { data } = await db().from("profiles").select("id").eq("is_persona_template", true);
  for (const t of data ?? []) await clonePersona(t.id, workspaceId);
  revalidatePath("/facility");
}
