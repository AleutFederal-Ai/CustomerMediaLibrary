import { v4 as uuidv4 } from "uuid";
import { auditLogs } from "@/lib/azure/cosmos";
import { AuditAction, AuditLogRecord } from "@/types";

// 90-day retention in seconds
const AUDIT_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface AuditEntry {
  userEmail: string;
  ipAddress: string;
  action: AuditAction;
  tenantId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Write an append-only audit log entry to Cosmos DB.
 * Never throws — audit failures are logged to stderr but do not block the response.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const container = await auditLogs();

    const record: AuditLogRecord = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      userEmail: entry.userEmail,
      ipAddress: entry.ipAddress,
      action: entry.action,
      ...(entry.tenantId && { tenantId: entry.tenantId }),
      detail: entry.detail ?? {},
      ttl: AUDIT_TTL_SECONDS,
    };

    await container.items.create(record);
  } catch (err) {
    // Audit write failure must not fail the request
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
}
