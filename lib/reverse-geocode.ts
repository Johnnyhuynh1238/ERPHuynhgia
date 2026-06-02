type NominatimAddress = {
  house_number?: string;
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

export function formatVnAddress(resp: NominatimResponse): string | null {
  const addr = resp.address;
  if (!addr) return resp.display_name || null;

  const parts: string[] = [];
  const push = (v?: string) => {
    if (!v) return;
    if (parts.includes(v)) return;
    parts.push(v);
  };

  // Số nhà + đường
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ").trim();
  if (street) parts.push(street);

  // Khu phố / xóm
  push(addr.neighbourhood);
  push(addr.hamlet);

  // Xã / Phường / Thị trấn
  push(addr.village);
  push(addr.town);
  push(addr.suburb);
  push(addr.quarter);

  // Quận / Huyện
  push(addr.city_district);
  push(addr.county);

  // Tỉnh / Thành phố
  push(addr.state);
  push(addr.city);

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
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi&zoom=18&addressdetails=1`;
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
