import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { users } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { getUserRecordByEmail, toUserProfileSummary } from "@/lib/profile";
import { AuditAction, UserProfileSummary, UserRecord } from "@/types";

const PROFILE_FIELDS = [
  "displayName",
  "jobTitle",
  "organization",
  "phoneNumber",
  "officeLocation",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];

function sanitizeValue(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "";

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getUserRecordByEmail(email);
    const summary: UserProfileSummary = toUserProfileSummary(email, user);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[me/profile] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "";
  const ip = request.headers.get("x-client-ip") ?? "unknown";

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const nextValues: Record<ProfileField, string> = {
    displayName: sanitizeValue(body.displayName, 120),
    jobTitle: sanitizeValue(body.jobTitle, 120),
    organization: sanitizeValue(body.organization, 120),
    phoneNumber: sanitizeValue(body.phoneNumber, 50),
    officeLocation: sanitizeValue(body.officeLocation, 120),
  };

  try {
    const container = await users();
    const user = await getUserRecordByEmail(email);

    if (!user) {
      const now = new Date().toISOString();
      const created: UserRecord = {
        id: uuidv4(),
        email: email.toLowerCase(),
        firstLoginAt: now,
        lastLoginAt: now,
        loginCount: 0,
        isBlocked: false,
        ...Object.fromEntries(
          PROFILE_FIELDS.filter((field) => nextValues[field]).map((field) => [
            field,
            nextValues[field],
          ])
        ),
      };
      await container.items.create(created);
      await writeAuditLog({
        userEmail: email,
        ipAddress: ip,
        action: AuditAction.PROFILE_UPDATED,
        detail: {
          fields: PROFILE_FIELDS.filter((field) => nextValues[field]),
          source: "self-service",
        },
      });
      return NextResponse.json(toUserProfileSummary(email, created));
    }

    const operations: Array<
      | {
          op: "add";
          path: string;
          value: string;
        }
      | {
          op: "remove";
          path: string;
        }
    > = [];

    for (const field of PROFILE_FIELDS) {
      const nextValue = nextValues[field];
      const hasExistingValue =
        typeof user[field] === "string" && user[field]?.trim().length > 0;

      if (nextValue) {
        operations.push({ op: "add", path: `/${field}`, value: nextValue });
      } else if (hasExistingValue) {
        operations.push({ op: "remove", path: `/${field}` });
      }
    }

    if (operations.length > 0) {
      await container.item(user.id, user.id).patch(operations);
    }

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.PROFILE_UPDATED,
      detail: {
        fields: PROFILE_FIELDS,
        source: "self-service",
      },
    });

    const updatedUser = await getUserRecordByEmail(email);
    return NextResponse.json(toUserProfileSummary(email, updatedUser));
  } catch (error) {
    console.error("[me/profile] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
