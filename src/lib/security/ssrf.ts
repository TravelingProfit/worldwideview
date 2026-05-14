import dns from "dns/promises";
import { fetch, Agent } from "undici";

export function isPrivateIP(ip: string): boolean {
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    if (ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80")) return true;
    return false;
}

export function validateOrigin(urlStr: string): boolean {
    try {
        const url = new URL(urlStr);
        return url.protocol === "https:";
    } catch {
        return false;
    }
}

interface FetchOptions extends RequestInit {
    maxSize?: number;
    timeout?: number;
}

export async function safeFetch(urlStr: string, options: FetchOptions = {}): Promise<Response> {
    if (!validateOrigin(urlStr)) {
        throw new Error("SSRF Error: Invalid protocol. Only HTTPS is allowed.");
    }
    
    const url = new URL(urlStr);
    
    if (isPrivateIP(url.hostname)) {
        throw new Error("SSRF Error: Private IP provided in URL.");
    }

    let resolvedIp: string;
    let resolvedFamily: 4 | 6;
    try {
        const lookupResult = await dns.lookup(url.hostname);
        resolvedIp = lookupResult.address;
        resolvedFamily = lookupResult.family;
        if (isPrivateIP(resolvedIp)) {
            throw new Error("SSRF Error: Host resolves to a private IP.");
        }
    } catch (err: any) {
        if (err.message.includes("SSRF")) throw err;
        throw new Error(`SSRF Error: DNS resolution failed - ${err.message}`);
    }

    const customAgent = new Agent({
        connect: {
            lookup: (hostname, opts, callback) => {
                callback(null, [{ address: resolvedIp, family: resolvedFamily }]);
            }
        }
    });

    const maxSize = options.maxSize || 5 * 1024 * 1024;
    const timeout = options.timeout || 10000;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(urlStr, {
            ...options,
            dispatcher: customAgent,
            redirect: "manual",
            signal: controller.signal as any
        });
        
        if (response.body) {
            let totalSize = 0;
            const reader = response.body.getReader();
            const stream = new ReadableStream({
                async pull(controller) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            return;
                        }
                        totalSize += value.byteLength;
                        if (totalSize > maxSize) {
                            controller.error(new Error("SSRF Error: Response size exceeded maximum limit."));
                            reader.cancel();
                            return;
                        }
                        controller.enqueue(value);
                    } catch (err) {
                        controller.error(err);
                    }
                },
                cancel() {
                    reader.cancel();
                }
            });
            
            return new Response(stream, {
                status: response.status,
                headers: response.headers as any
            });
        }
        
        return response as unknown as Response;
    } finally {
        clearTimeout(id);
    }
}
