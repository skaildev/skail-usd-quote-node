import { Currencies, type Currency } from "@skail-usd-quote/contracts";

interface Props {
  value: Currency;
  disabled: boolean;
  onChange: (currency: Currency) => void;
}

export function CurrencySelect({ value, disabled, onChange }: Props) {
  return (
    <>
      <label htmlFor="currency">Currency</label>
      <select id="currency" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Currency)}>
        {Currencies.all.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
    </>
  );
}
