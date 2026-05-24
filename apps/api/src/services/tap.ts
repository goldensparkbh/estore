import Decimal from "decimal.js";

export interface TapChargeCustomer {
  firstName: string;
  email: string;
}

export interface TapCreateChargeInput {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  orderNumber: string;
  customer: TapChargeCustomer;
  redirectUrl: string;
  tenantDestinationId: string;
  tenantNetAmount: number;
  metadata?: Record<string, string>;
}

export interface TapChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  redirect?: { url?: string; status?: string };
  transaction?: { url?: string };
  reference?: { transaction?: string; order?: string };
  response?: { code?: string; message?: string };
}

export function tapConfigured(): boolean {
  return Boolean(process.env.TAP_SECRET_KEY?.trim());
}

export function tapWebhookSecret(): string | null {
  return process.env.TAP_WEBHOOK_SECRET?.trim() || null;
}

function authHeader(): string {
  const key = process.env.TAP_SECRET_KEY?.trim();
  if (!key) throw new Error("TAP_SECRET_KEY is not configured");
  return `Bearer ${key}`;
}

export async function tapCreateCharge(input: TapCreateChargeInput): Promise<TapChargeResponse> {
  const body = {
    amount: input.amount,
    currency: input.currency,
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: input.description,
    metadata: {
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      tenantDestinationId: input.tenantDestinationId,
      ...input.metadata,
    },
    reference: {
      transaction: input.orderNumber,
      order: input.orderId,
    },
    receipt: { email: true, sms: false },
    customer: {
      first_name: input.customer.firstName,
      email: input.customer.email,
    },
    source: { id: "src_all" },
    redirect: { url: input.redirectUrl },
    post: { url: `${appBaseUrl()}/v1/webhooks/tap` },
    destinations: {
      destination: [
        {
          id: input.tenantDestinationId,
          amount: roundMoney(input.tenantNetAmount),
          currency: input.currency,
        },
      ],
    },
  };

  const res = await fetch("https://api.tap.company/v2/charges/", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `TAP charge failed (${res.status})`);
  }

  return (await res.json()) as TapChargeResponse;
}

export async function tapRetrieveCharge(chargeId: string): Promise<TapChargeResponse> {
  const res = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `TAP retrieve failed (${res.status})`);
  }
  return (await res.json()) as TapChargeResponse;
}

export function appBaseUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export function roundMoney(n: number): number {
  return new Decimal(n).toDecimalPlaces(3).toNumber();
}

export type MarketplacePaymentStatus =
  | "PENDING"
  | "INITIATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export function mapTapStatus(status: string): MarketplacePaymentStatus {
  switch (status.toUpperCase()) {
    case "INITIATED":
      return "INITIATED";
    case "IN_PROGRESS":
    case "PENDING":
      return "PENDING";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "CAPTURED":
      return "CAPTURED";
    case "CANCELLED":
    case "CANCELED":
      return "CANCELLED";
    case "FAILED":
    case "DECLINED":
    case "RESTRICTED":
    case "TIMEDOUT":
    case "UNKNOWN":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";
    default:
      return "PENDING";
  }
}

export interface PaymentSplit {
  gross: Decimal;
  tapFee: Decimal;
  platformCommission: Decimal;
  tenantNet: Decimal;
  commissionRate: Decimal;
  tapFeeRate: Decimal;
}

export function calculateMarketplaceSplit(input: {
  gross: string | number;
  commissionRatePercent: string | number;
  tapFeeRatePercent: string | number;
}): PaymentSplit {
  const gross = new Decimal(input.gross);
  const commissionRate = new Decimal(input.commissionRatePercent);
  const tapFeeRate = new Decimal(input.tapFeeRatePercent);

  const tapFee = gross.mul(tapFeeRate).div(100);
  const afterTap = gross.minus(tapFee);
  const platformCommission = afterTap.mul(commissionRate).div(100);
  const tenantNet = afterTap.minus(platformCommission);

  return {
    gross,
    tapFee,
    platformCommission,
    tenantNet,
    commissionRate,
    tapFeeRate,
  };
}
