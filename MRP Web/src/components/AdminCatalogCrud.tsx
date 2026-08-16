"use client";

import { useState } from "react";
import {
  catalogToFirebase,
  emptyCoupon,
  emptyDiscount,
  emptyLink,
  emptyPrice,
  removeById,
  upsert,
  type OpsCatalogLists,
  type OpsCouponItem,
  type OpsDiscountItem,
  type OpsLinkItem,
  type OpsPriceItem,
} from "@/lib/ops-catalog-model";

type Props = {
  lists: OpsCatalogLists;
  busy?: boolean;
  onSave: (next: OpsCatalogLists, kind: string) => Promise<void>;
};

export function AdminCatalogCrud({ lists, busy, onSave }: Props) {
  const [tab, setTab] = useState<"promotions" | "affiliates" | "pricing" | "coupons" | "discounts">(
    "promotions",
  );
  const [link, setLink] = useState<OpsLinkItem>(emptyLink());
  const [price, setPrice] = useState<OpsPriceItem>(emptyPrice());
  const [coupon, setCoupon] = useState<OpsCouponItem>(emptyCoupon());
  const [discount, setDiscount] = useState<OpsDiscountItem>(emptyDiscount());

  const tabs = ["promotions", "affiliates", "pricing", "coupons", "discounts"] as const;

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <h2>Catalog CRUD</h2>
      <p className="muted">Same lists as Hub → Admin on the phone. Saving notifies the in-app inbox.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0.75rem 0" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "btn btn-primary" : "btn"}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "promotions" || tab === "affiliates" ? (
        <LinkEditor
          rows={tab === "promotions" ? lists.promotions : lists.affiliates}
          draft={link}
          setDraft={setLink}
          disabled={busy}
          onSave={() => {
            if (!link.title.trim() || !link.url.trim()) return;
            void onSave(
              { ...lists, [tab]: upsert(lists[tab], link) },
              tab === "promotions" ? "Promotions" : "Affiliates",
            ).then(() => setLink(emptyLink()));
          }}
          onDelete={(id) =>
            void onSave(
              {
                ...lists,
                [tab]: removeById(tab === "promotions" ? lists.promotions : lists.affiliates, id),
              },
              tab === "promotions" ? "Promotions" : "Affiliates",
            )
          }
          onNew={() => setLink(emptyLink())}
        />
      ) : null}

      {tab === "pricing" ? (
        <>
          <table className="table" style={{ width: "100%", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Monthly</th>
                <th>Yearly</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lists.prices.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.productId}</td>
                  <td>{p.monthly}</td>
                  <td>{p.yearly}</td>
                  <td>{p.discountNote}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => setPrice(p)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void onSave({ ...lists, prices: removeById(lists.prices, p.id) }, "Pricing")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid-2" style={{ marginTop: "0.75rem" }}>
            <Field label="productId" value={price.productId} onChange={(v) => setPrice({ ...price, productId: v })} />
            <Field label="Monthly" value={price.monthly} onChange={(v) => setPrice({ ...price, monthly: v })} />
            <Field label="Yearly" value={price.yearly} onChange={(v) => setPrice({ ...price, yearly: v })} />
            <Field
              label="Discount note"
              value={price.discountNote}
              onChange={(v) => setPrice({ ...price, discountNote: v })}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void onSave({ ...lists, prices: upsert(lists.prices, price) }, "Pricing").then(() =>
                setPrice(emptyPrice()),
              )
            }
          >
            Save price
          </button>
        </>
      ) : null}

      {tab === "coupons" ? (
        <>
          <table className="table" style={{ width: "100%", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>%</th>
                <th>Label</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lists.coupons.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td>{c.percent}</td>
                  <td>
                    {c.label} {c.active ? "" : "(off)"}
                  </td>
                  <td>
                    <button type="button" className="btn" onClick={() => setCoupon(c)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void onSave({ ...lists, coupons: removeById(lists.coupons, c.id) }, "Coupons")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid-2" style={{ marginTop: "0.75rem" }}>
            <Field label="Code" value={coupon.code} onChange={(v) => setCoupon({ ...coupon, code: v })} />
            <Field
              label="Percent"
              value={String(coupon.percent)}
              onChange={(v) => setCoupon({ ...coupon, percent: Number(v) || 0 })}
            />
            <Field label="Label" value={coupon.label} onChange={(v) => setCoupon({ ...coupon, label: v })} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (!coupon.code.trim()) return;
              void onSave({ ...lists, coupons: upsert(lists.coupons, coupon) }, "Coupons").then(() =>
                setCoupon(emptyCoupon()),
              );
            }}
          >
            Save coupon
          </button>
        </>
      ) : null}

      {tab === "discounts" ? (
        <>
          <table className="table" style={{ width: "100%", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th>Title</th>
                <th>%</th>
                <th>Applies to</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lists.discounts.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.percent}</td>
                  <td>{d.appliesTo}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => setDiscount(d)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void onSave({ ...lists, discounts: removeById(lists.discounts, d.id) }, "Discounts")
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid-2" style={{ marginTop: "0.75rem" }}>
            <Field label="Title" value={discount.title} onChange={(v) => setDiscount({ ...discount, title: v })} />
            <Field
              label="Percent"
              value={String(discount.percent)}
              onChange={(v) => setDiscount({ ...discount, percent: Number(v) || 0 })}
            />
            <Field label="Label" value={discount.label} onChange={(v) => setDiscount({ ...discount, label: v })} />
            <Field
              label="Applies to"
              value={discount.appliesTo}
              onChange={(v) => setDiscount({ ...discount, appliesTo: v })}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (!discount.title.trim()) return;
              void onSave({ ...lists, discounts: upsert(lists.discounts, discount) }, "Discounts").then(() =>
                setDiscount(emptyDiscount()),
              );
            }}
          >
            Save discount
          </button>
        </>
      ) : null}
      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
        Payload keys: {Object.keys(catalogToFirebase(lists)).join(", ")}
      </p>
    </div>
  );
}

function LinkEditor({
  rows,
  draft,
  setDraft,
  onSave,
  onDelete,
  onNew,
  disabled,
}: {
  rows: OpsLinkItem[];
  draft: OpsLinkItem;
  setDraft: (v: OpsLinkItem) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      <table className="table" style={{ width: "100%", fontSize: "0.9rem" }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>URL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title}
                <div className="muted">{r.subtitle}</div>
              </td>
              <td className="mono">{r.url}</td>
              <td>
                <button type="button" className="btn" onClick={() => setDraft(r)}>
                  Edit
                </button>{" "}
                <button type="button" className="btn" onClick={() => onDelete(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="muted">
                No items.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="grid-2" style={{ marginTop: "0.75rem" }}>
        <Field label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
        <Field label="Subtitle" value={draft.subtitle} onChange={(v) => setDraft({ ...draft, subtitle: v })} />
        <Field label="URL" value={draft.url} onChange={(v) => setDraft({ ...draft, url: v })} />
      </div>
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={onSave}>
        Save
      </button>{" "}
      <button type="button" className="btn" onClick={onNew}>
        New
      </button>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
