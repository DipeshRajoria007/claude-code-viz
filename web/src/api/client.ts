export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "POST" });
  if (!response.ok) {
    throw new ApiError(response.status, `${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
