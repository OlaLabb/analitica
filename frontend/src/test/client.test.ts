import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildQuery, tokenStore, UNAUTHORIZED_EVENT } from "@/api/client";

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("cliente API", () => {
  it("construye la query omitiendo vacíos y uniendo listas", () => {
    expect(buildQuery({ mode: "years", years: [2023, 2024], n: undefined, start: "", top: 0 })).toBe("?mode=years&years=2023%2C2024&top=0");
    expect(buildQuery({})).toBe("");
  });

  it("envía el token Bearer", async () => {
    tokenStore.set("abc");
    const f = mockFetch(200, { ok: true });
    await api("/games");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("expone mensaje y ejemplos de un 422 con detalle estructurado (reglas en conflicto)", async () => {
    mockFetch(422, { detail: { message: "3 sorteos vigentes no cumplen", examples: [{ draw_date: "2024-01-01", errors: ["x"] }] } });
    const err = await api<never>("/games/BALOTO/rules", { method: "POST", body: {} }).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.message).toBe("3 sorteos vigentes no cumplen");
    expect(err.examples).toHaveLength(1);
  });

  it("formatea errores de validación de Pydantic", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "password"], msg: "too short" }] });
    const err = await api<never>("/auth/login", { method: "POST", body: {} }).catch((e: unknown) => e as ApiError);
    expect(err.message).toBe("password: too short");
  });

  it("emite el evento de sesión expirada en 401 con token", async () => {
    tokenStore.set("expired");
    mockFetch(401, { detail: "Token inválido o expirado" });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await api("/auth/me").catch(() => undefined);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalled();
  });
});
