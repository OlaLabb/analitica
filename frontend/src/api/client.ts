/**
 * Cliente HTTP mínimo para el backend FastAPI.
 * - Añade el token Bearer almacenado.
 * - Normaliza los errores (detail string | {message, examples} | lista de validación Pydantic).
 * - Emite un evento global cuando el backend responde 401 para cerrar la sesión.
 */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8000";
export const API_BASE = `${API_URL}/api`;

const TOKEN_KEY = "as.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

export const UNAUTHORIZED_EVENT = "as:unauthorized";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  examples?: unknown[];
  constructor(status: number, message: string, detail: unknown, examples?: unknown[]) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.examples = examples;
  }
}

function messageFromDetail(detail: unknown, status: number): { message: string; examples?: unknown[] } {
  if (typeof detail === "string") return { message: detail };
  if (Array.isArray(detail)) {
    // Errores de validación de FastAPI/Pydantic
    const parts = detail.map((d: { loc?: (string | number)[]; msg?: string }) => {
      const loc = (d.loc ?? []).filter((x) => x !== "body" && x !== "query").join(".");
      return loc ? `${loc}: ${d.msg ?? ""}` : (d.msg ?? "");
    });
    return { message: parts.join(" · ") || "Datos inválidos" };
  }
  if (detail && typeof detail === "object") {
    const o = detail as { message?: string; examples?: unknown[] };
    return { message: o.message ?? JSON.stringify(detail), examples: o.examples };
  }
  return { message: `Error ${status}` };
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function buildQuery(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      sp.set(k, v.join(","));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "No se pudo conectar con el servidor. Verifique que la API esté en ejecución.", null);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in (data as object) ? (data as { detail: unknown }).detail : data;
    const { message, examples } = messageFromDetail(detail, res.status);
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, message, detail, examples);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Error desconocido";
}
