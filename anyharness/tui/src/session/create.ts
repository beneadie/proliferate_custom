import type { AnyHarnessClient, Session } from "@anyharness/sdk";

export interface CreateSessionInput {
  repoPath: string;
  agentKind: string;
  modelId?: string;
  prompt?: string;
}

export interface CreatedSession {
  session: Session;
  workspaceId: string;
  repoRootId: string;
  workspacePath: string;
}

export async function createSession(
  client: AnyHarnessClient,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const resolved = await client.workspaces.resolveFromPath(input.repoPath);

  const session = await client.sessions.create({
    workspaceId: resolved.workspace.id,
    agentKind: input.agentKind,
    ...(input.modelId ? { modelId: input.modelId } : {}),
  });

  if (input.prompt) {
    await client.sessions.promptText(session.id, input.prompt);
  }

  return {
    session,
    workspaceId: resolved.workspace.id,
    repoRootId: resolved.repoRoot.id,
    workspacePath: resolved.workspace.path,
  };
}
