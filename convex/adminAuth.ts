export const ALWAYS_ALLOWED_PHONES = ["714066514", "714545776"]; // Modinee, Anjala

type AdminArgs = {
  actorPhone: string;
  adminKey: string;
};

export function assertAdminAccess(args: AdminArgs) {
  if (!ALWAYS_ALLOWED_PHONES.includes(args.actorPhone)) {
    throw new Error("UNAUTHORIZED");
  }

  const configuredKey = ((globalThis as any).process?.env?.ADMIN_MUTATION_KEY ||
    "") as string;
  if (!configuredKey) {
    throw new Error("ADMIN_KEY_NOT_CONFIGURED");
  }

  if (!args.adminKey || args.adminKey !== configuredKey) {
    throw new Error("UNAUTHORIZED");
  }
}
