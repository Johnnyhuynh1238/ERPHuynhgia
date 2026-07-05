"use client";

// Ô nhập tiền VND hiển thị phân cách ngàn (vd 1.500.000).
// State bên ngoài giữ chuỗi số thô ("1500000") nên Number(value) ở submit không đổi.
export function MoneyInput({
  value,
  onChange,
  required,
  placeholder,
  className,
}: {
  value: string;
  onChange: (raw: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const digits = String(value).replace(/\D/g, "");
  const display = digits ? Number(digits).toLocaleString("vi-VN") : "";
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      required={required}
      placeholder={placeholder}
      className={className}
    />
  );
}
