import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useFocusEffect} from '@react-navigation/native';
import {HubFeelScrollView, HubStyleTabBar, HubTabPage} from '../../shared/components/HubFeel';
import {useHorizontalTabSwipe} from '../../shared/hooks/useHorizontalTabSwipe';
import MrpOps, {type OpsUserRow} from '../../native/MrpOps.types';
import {useOpsCatalog} from './useOpsCatalog';
import {
  catalogToFirebase,
  emptyCoupon,
  emptyDiscount,
  emptyLink,
  emptyPrice,
  parseCatalog,
  removeById,
  upsert,
  type OpsCatalogLists,
  type OpsCouponItem,
  type OpsDiscountItem,
  type OpsLinkItem,
  type OpsPriceItem,
} from './opsCatalogModel';

type MainTab = 'USERS' | 'OFFERS' | 'PLANS' | 'NOTIFY';

const MAIN_TABS: {key: MainTab; label: string; icon: string}[] = [
  {key: 'USERS', label: 'Users', icon: '👤'},
  {key: 'OFFERS', label: 'Offers', icon: '🏷️'},
  {key: 'PLANS', label: 'Plans', icon: '💳'},
  {key: 'NOTIFY', label: 'Notify', icon: '🔔'},
];

export function AdminOpsScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {ops, refresh} = useOpsCatalog();
  const [tab, setTab] = useState<MainTab>('USERS');
  const [offerKind, setOfferKind] = useState<'promotions' | 'affiliates'>('promotions');
  const [planKind, setPlanKind] = useState<'pricing' | 'coupons' | 'discounts'>('pricing');
  const [users, setUsers] = useState<OpsUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState<OpsCatalogLists>(parseCatalog({}));
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [grantUid, setGrantUid] = useState('');
  const [grantTier, setGrantTier] = useState('premium');
  const [grantProduct, setGrantProduct] = useState('mrp_premium');
  const [grantNote, setGrantNote] = useState('');
  const [editPromo, setEditPromo] = useState<OpsLinkItem>(emptyLink());
  const [editAff, setEditAff] = useState<OpsLinkItem>(emptyLink());
  const [editPrice, setEditPrice] = useState<OpsPriceItem>(emptyPrice());
  const [editCoupon, setEditCoupon] = useState<OpsCouponItem>(emptyCoupon());
  const [editDiscount, setEditDiscount] = useState<OpsDiscountItem>(emptyDiscount());

  const tabIndex = MAIN_TABS.findIndex(t => t.key === tab);
  const onSwipeIndex = useCallback((i: number) => {
    const next = MAIN_TABS[i];
    if (next) setTab(next.key);
  }, []);
  const swipeHandlers = useHorizontalTabSwipe(Math.max(0, tabIndex), MAIN_TABS.length, onSwipeIndex);

  const loadUsers = useCallback(async () => {
    if (!MrpOps?.adminListUsers) return;
    try {
      setUsers((await MrpOps.adminListUsers()) || []);
    } catch (e: any) {
      Alert.alert('Admin', e?.message || 'Could not list users (sign in + RTDB rules).');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadUsers();
    }, [loadUsers]),
  );

  useEffect(() => {
    setLists(parseCatalog(ops.catalog));
  }, [ops.catalog]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('Admin', ok);
      await refresh();
      await loadUsers();
    } catch (e: any) {
      Alert.alert('Admin', e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const persistLists = (next: OpsCatalogLists, kind: string) =>
    run(async () => {
      setLists(next);
      await MrpOps!.adminSaveCatalog(JSON.stringify(catalogToFirebase(next)));
      await MrpOps!.adminPushBroadcast(
        `${kind} updated`,
        'Open Hub to see the latest offers and prices.',
        'catalog',
      );
    }, `${kind} saved. Users notified.`);

  const setGrant = () =>
    run(async () => {
      if (!grantUid.trim()) throw new Error('Select a user');
      await MrpOps!.adminSetGrant(grantUid.trim(), grantTier.trim(), grantProduct.trim(), grantNote.trim());
    }, 'Subscription grant saved.');

  const pushNotice = () =>
    run(async () => {
      if (!pushTitle.trim()) throw new Error('Title required');
      await MrpOps!.adminPushBroadcast(pushTitle.trim(), pushBody.trim(), 'promo');
      setPushTitle('');
      setPushBody('');
    }, 'Notification sent to the app inbox.');

  const saveOffer = (kind: 'promotions' | 'affiliates') => {
    const draft = kind === 'promotions' ? editPromo : editAff;
    if (!draft.title.trim() || !draft.url.trim()) {
      Alert.alert('Admin', 'Title and URL required');
      return;
    }
    persistLists(
      {...lists, [kind]: upsert(lists[kind], draft)},
      kind === 'promotions' ? 'Promotions' : 'Affiliates',
    );
    if (kind === 'promotions') setEditPromo(emptyLink());
    else setEditAff(emptyLink());
  };

  const ph = colors.textMuted;
  const offerDraft = offerKind === 'promotions' ? editPromo : editAff;
  const setOfferDraft = offerKind === 'promotions' ? setEditPromo : setEditAff;

  return (
    <View style={styles.root}>
      <HubStyleTabBar
        tabs={MAIN_TABS}
        activeKey={tab}
        onChange={key => setTab(key as MainTab)}
        colors={colors}
      />
      {busy ? <ActivityIndicator color={colors.sky} style={styles.busy} /> : null}

      <View style={styles.body} {...swipeHandlers}>
        <HubTabPage pageKey={tab}>
          {tab === 'USERS' ? (
            <HubFeelScrollView bounceKey="users">
              <Text style={styles.lead}>Tap a user, then save a plan. Identity fills after they open the signed-in app.</Text>
              {users.length === 0 ? (
                <Text style={styles.muted}>No synced users yet.</Text>
              ) : (
                users.map(u => (
                  <Pressable
                    key={u.uid}
                    style={[styles.card, grantUid === u.uid && styles.cardOn]}
                    onPress={() => setGrantUid(u.uid)}>
                    <Text style={styles.cardTitle}>{u.accountEmail || 'No email'}</Text>
                    <Text style={styles.meta}>{u.displayName || '—'}</Text>
                    <Text style={styles.meta}>{u.phoneNumber || 'No mobile'}</Text>
                    <Text style={styles.metaMono}>{u.deviceMac || 'No device id'}</Text>
                    <Text style={styles.planChip}>
                      {(u.tier || 'no plan').toUpperCase()}
                      {u.productId ? ` · ${u.productId}` : ''}
                    </Text>
                  </Pressable>
                ))
              )}
              <Text style={styles.h}>Plan</Text>
              <Field styles={styles} value={grantUid} onChange={setGrantUid} placeholder="Firebase uid" ph={ph} />
              <Field styles={styles} value={grantTier} onChange={setGrantTier} placeholder="free · basic · premium · family · enterprise" ph={ph} />
              <Field styles={styles} value={grantProduct} onChange={setGrantProduct} placeholder="productId" ph={ph} />
              <Field styles={styles} value={grantNote} onChange={setGrantNote} placeholder="Note" ph={ph} />
              <PrimaryButton label="Save plan" onPress={setGrant} disabled={busy} styles={styles} />
            </HubFeelScrollView>
          ) : null}

          {tab === 'OFFERS' ? (
            <HubFeelScrollView bounceKey={`offers-${offerKind}`}>
              <Segment
                styles={styles}
                options={[
                  {id: 'promotions', label: 'Promotions'},
                  {id: 'affiliates', label: 'Affiliates'},
                ]}
                value={offerKind}
                onChange={id => setOfferKind(id as 'promotions' | 'affiliates')}
              />
              <LinkList
                styles={styles}
                colors={colors}
                rows={offerKind === 'promotions' ? lists.promotions : lists.affiliates}
                draft={offerDraft}
                setDraft={setOfferDraft}
                onDelete={id =>
                  persistLists(
                    {
                      ...lists,
                      [offerKind]: removeById(
                        offerKind === 'promotions' ? lists.promotions : lists.affiliates,
                        id,
                      ),
                    },
                    offerKind === 'promotions' ? 'Promotions' : 'Affiliates',
                  )
                }
                onSave={() => saveOffer(offerKind)}
              />
            </HubFeelScrollView>
          ) : null}

          {tab === 'PLANS' ? (
            <HubFeelScrollView bounceKey={`plans-${planKind}`}>
              <Segment
                styles={styles}
                options={[
                  {id: 'pricing', label: 'Pricing'},
                  {id: 'coupons', label: 'Coupons'},
                  {id: 'discounts', label: 'Discounts'},
                ]}
                value={planKind}
                onChange={id => setPlanKind(id as 'pricing' | 'coupons' | 'discounts')}
              />
              {planKind === 'pricing' ? (
                <>
                  {lists.prices.map(p => (
                    <RowCard
                      key={p.id}
                      styles={styles}
                      title={p.productId}
                      body={`Monthly ${p.monthly || '—'}  ·  Yearly ${p.yearly || '—'}${p.discountNote ? `\n${p.discountNote}` : ''}`}
                      onEdit={() => setEditPrice(p)}
                      onDelete={() => persistLists({...lists, prices: removeById(lists.prices, p.id)}, 'Pricing')}
                    />
                  ))}
                  <Text style={styles.h}>Price</Text>
                  <Field styles={styles} value={editPrice.productId} onChange={t => setEditPrice({...editPrice, productId: t})} placeholder="productId" ph={ph} />
                  <Field styles={styles} value={editPrice.monthly} onChange={t => setEditPrice({...editPrice, monthly: t})} placeholder="Monthly e.g. ₹399" ph={ph} />
                  <Field styles={styles} value={editPrice.yearly} onChange={t => setEditPrice({...editPrice, yearly: t})} placeholder="Yearly e.g. ₹2,999" ph={ph} />
                  <Field styles={styles} value={editPrice.discountNote} onChange={t => setEditPrice({...editPrice, discountNote: t})} placeholder="Discount note" ph={ph} />
                  <PrimaryButton
                    label="Save price"
                    disabled={busy}
                    styles={styles}
                    onPress={() => {
                      persistLists({...lists, prices: upsert(lists.prices, editPrice)}, 'Pricing');
                      setEditPrice(emptyPrice());
                    }}
                  />
                </>
              ) : null}
              {planKind === 'coupons' ? (
                <>
                  {lists.coupons.map(c => (
                    <RowCard
                      key={c.id}
                      styles={styles}
                      title={`${c.code} · ${c.percent}%`}
                      body={c.label}
                      onEdit={() => setEditCoupon(c)}
                      onDelete={() => persistLists({...lists, coupons: removeById(lists.coupons, c.id)}, 'Coupons')}
                    />
                  ))}
                  <Text style={styles.h}>Coupon</Text>
                  <Field styles={styles} value={editCoupon.code} onChange={t => setEditCoupon({...editCoupon, code: t})} placeholder="Code e.g. WELCOME10" ph={ph} autoCap="characters" />
                  <Field styles={styles} value={String(editCoupon.percent)} onChange={t => setEditCoupon({...editCoupon, percent: Number(t) || 0})} placeholder="Percent" ph={ph} keyboard="number-pad" />
                  <Field styles={styles} value={editCoupon.label} onChange={t => setEditCoupon({...editCoupon, label: t})} placeholder="Label" ph={ph} />
                  <PrimaryButton
                    label="Save coupon"
                    disabled={busy}
                    styles={styles}
                    onPress={() => {
                      if (!editCoupon.code.trim()) {
                        Alert.alert('Admin', 'Code required');
                        return;
                      }
                      persistLists({...lists, coupons: upsert(lists.coupons, editCoupon)}, 'Coupons');
                      setEditCoupon(emptyCoupon());
                    }}
                  />
                </>
              ) : null}
              {planKind === 'discounts' ? (
                <>
                  {lists.discounts.map(d => (
                    <RowCard
                      key={d.id}
                      styles={styles}
                      title={`${d.title} · ${d.percent}%`}
                      body={`${d.label}${d.appliesTo ? ` · ${d.appliesTo}` : ''}`}
                      onEdit={() => setEditDiscount(d)}
                      onDelete={() => persistLists({...lists, discounts: removeById(lists.discounts, d.id)}, 'Discounts')}
                    />
                  ))}
                  <Text style={styles.h}>Discount</Text>
                  <Field styles={styles} value={editDiscount.title} onChange={t => setEditDiscount({...editDiscount, title: t})} placeholder="Title" ph={ph} />
                  <Field styles={styles} value={String(editDiscount.percent)} onChange={t => setEditDiscount({...editDiscount, percent: Number(t) || 0})} placeholder="Percent" ph={ph} keyboard="number-pad" />
                  <Field styles={styles} value={editDiscount.label} onChange={t => setEditDiscount({...editDiscount, label: t})} placeholder="Label" ph={ph} />
                  <Field styles={styles} value={editDiscount.appliesTo} onChange={t => setEditDiscount({...editDiscount, appliesTo: t})} placeholder="Applies to productId" ph={ph} />
                  <PrimaryButton
                    label="Save discount"
                    disabled={busy}
                    styles={styles}
                    onPress={() => {
                      if (!editDiscount.title.trim()) {
                        Alert.alert('Admin', 'Title required');
                        return;
                      }
                      persistLists({...lists, discounts: upsert(lists.discounts, editDiscount)}, 'Discounts');
                      setEditDiscount(emptyDiscount());
                    }}
                  />
                </>
              ) : null}
            </HubFeelScrollView>
          ) : null}

          {tab === 'NOTIFY' ? (
            <HubFeelScrollView bounceKey="notify">
              <Text style={styles.lead}>Inbox notice for signed-in users. Shows on Home badge and Notifications.</Text>
              <Field styles={styles} value={pushTitle} onChange={setPushTitle} placeholder="Title" ph={ph} />
              <TextInput
                style={[styles.input, styles.area]}
                value={pushBody}
                onChangeText={setPushBody}
                placeholder="Message"
                placeholderTextColor={ph}
                multiline
              />
              <PrimaryButton label="Send notification" onPress={pushNotice} disabled={busy} styles={styles} />
            </HubFeelScrollView>
          ) : null}
        </HubTabPage>
      </View>
    </View>
  );
}

function Segment({
  styles,
  options,
  value,
  onChange,
}: {
  styles: ReturnType<typeof createStyles>;
  options: {id: string; label: string}[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            style={[styles.segItem, on && styles.segItemOn]}
            onPress={() => onChange(o.id)}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  styles,
  value,
  onChange,
  placeholder,
  ph,
  keyboard,
  autoCap,
}: {
  styles: ReturnType<typeof createStyles>;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  ph: string;
  keyboard?: 'number-pad';
  autoCap?: 'characters';
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={ph}
      keyboardType={keyboard}
      autoCapitalize={autoCap || 'none'}
    />
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  styles,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable style={[styles.btn, disabled && styles.btnOff]} onPress={onPress} disabled={disabled}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

function RowCard({
  styles,
  title,
  body,
  onEdit,
  onDelete,
}: {
  styles: ReturnType<typeof createStyles>;
  title: string;
  body: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {body ? <Text style={styles.meta}>{body}</Text> : null}
      <View style={styles.rowBtns}>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={styles.danger}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LinkList({
  styles,
  colors,
  rows,
  draft,
  setDraft,
  onDelete,
  onSave,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  rows: OpsLinkItem[];
  draft: OpsLinkItem;
  setDraft: (v: OpsLinkItem) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      {rows.length === 0 ? <Text style={styles.muted}>Nothing here yet.</Text> : null}
      {rows.map(item => (
        <RowCard
          key={item.id}
          styles={styles}
          title={item.title}
          body={`${item.subtitle}\n${item.url}`}
          onEdit={() => setDraft(item)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
      <Text style={styles.h}>{rows.some(r => r.id === draft.id) ? 'Edit' : 'Add'}</Text>
      <Field styles={styles} value={draft.title} onChange={t => setDraft({...draft, title: t})} placeholder="Title" ph={colors.textMuted} />
      <Field styles={styles} value={draft.subtitle} onChange={t => setDraft({...draft, subtitle: t})} placeholder="Subtitle" ph={colors.textMuted} />
      <Field styles={styles} value={draft.url} onChange={t => setDraft({...draft, url: t})} placeholder="https://…" ph={colors.textMuted} />
      <PrimaryButton label="Save" onPress={onSave} styles={styles} />
      <Pressable onPress={() => setDraft(emptyLink())} hitSlop={8}>
        <Text style={styles.link}>Clear form</Text>
      </Pressable>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {flex: 1},
    busy: {marginVertical: 6},
    lead: {fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md},
    h: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.lg,
      marginBottom: 8,
    },
    muted: {fontSize: 13, color: colors.textMuted, marginBottom: 8},
    meta: {fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: 2},
    metaMono: {fontSize: 12, color: colors.textSecondary, marginTop: 4, fontVariant: ['tabular-nums']},
    planChip: {marginTop: 8, fontSize: 12, fontWeight: '800', color: brandColors.googleBlue},
    input: {
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      marginBottom: 10,
      fontSize: 15,
    },
    area: {minHeight: 96, textAlignVertical: 'top'},
    btn: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    btnOff: {opacity: 0.5},
    btnText: {color: '#fff', fontWeight: '800', fontSize: 15},
    card: {
      padding: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    cardOn: {borderColor: brandColors.googleBlue, borderWidth: 2},
    cardTitle: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
    rowBtns: {flexDirection: 'row', gap: 20, marginTop: 10},
    link: {color: brandColors.googleBlue, fontWeight: '700', fontSize: 14},
    danger: {color: colors.red, fontWeight: '700', fontSize: 14},
    seg: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: 4,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    segItem: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: radius.sm,
    },
    segItemOn: {backgroundColor: brandColors.iconBg},
    segText: {fontSize: 13, fontWeight: '700', color: colors.textMuted},
    segTextOn: {color: brandColors.googleBlue},
  });
}
