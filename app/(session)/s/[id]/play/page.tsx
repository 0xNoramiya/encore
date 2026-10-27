import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionMode } from "@/components/SessionMode";
import { getViewableSession } from "@/lib/sessions";
import { voiceEnabled } from "@/lib/voice";
import { getWorkspaceId } from "@/lib/workspace";

export const metadata: Metadata = { title: "Session" };

export default async function PlayPage({ params }: PageProps<"/s/[id]/play">) {
  const { id } = await params;
  const found = await getViewableSession(id, await getWorkspaceId());
  if (!found) notFound();
  return <SessionMode sessionId={found.session.id} firstName={found.profile.first_name} plan={found.session.plan} canEdit={found.canEdit} voice={voiceEnabled()} />;
}
