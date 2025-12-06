type LimitResult = {
  success: boolean;
  remaining: number;
  retryAfterMs?: number;
};

const buckets = new Map<string, { count: number; expiresAt: number }>();

export const rateLimit = ({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): LimitResult => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt < now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { success: false, remaining: 0, retryAfterMs: bucket.expiresAt - now };
  }

  bucket.count += 1;
  return { success: true, remaining: limit - bucket.count };
};
