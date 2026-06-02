type NominatimAddress = {
  road?: string;
  hamlet?: string;
  village?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  town?: string;
  city_district?: string;
  county?: string;
  city?: string;
  state?: string;
  country?: string;
};

type NominatimResponse = {
  address?: NominatimAddress;
  display_name?: string;
};

function pickWard(addr: NominatimAddress): string | null {
  return (
    addr.village ||
    addr.town ||
    addr.suburb ||
    addr.quarter ||
    addr.neighbourhood ||
    addr.hamlet ||
    null
  );
}

function pickDistrict(addr: NominatimAddress): string | null {
  return addr.city_district || addr.county || null;
}

function pickProvince(addr: NominatimAddress): string | null {
  return addr.state || addr.city || null;
}

export function formatVnAddress(resp: NominatimResponse): string | null {
  const addr = resp.address;
  if (!addr) return resp.display_name || null;
  const ward = pickWard(addr);
  const district = pickDistrict(addr);
  const province = pickProvince(addr);
  const parts = [ward, district, province].filter(Boolean);
  if (parts.length === 0) return resp.display_name || null;
  return parts.join(", ");
}

export async function reverseGeocodeVn(
  lat: number,
  lng: number,
  timeoutMs = 4000,
): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi&zoom=16`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ERP-HuynhGia6/1.0 (contact: admin@huynhgia6.com)",
        Accept: "application/json",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as NominatimResponse;
    return formatVnAddress(json);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
