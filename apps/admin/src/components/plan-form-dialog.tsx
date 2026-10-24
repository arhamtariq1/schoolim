'use client';

import {
  BILLING_CYCLES,
  createPlanSchema,
  MAX_PLAN_FEATURES,
  ROUTES,
  updatePlanSchema,
  type BillingCycle,
  type Plan,
} from '@ilm/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  showApiErrorToast,
  showNetworkErrorToast,
  SimpleSelect,
  Textarea,
  useToast,
} from '@ilm/ui';
import { fromDecimalString, toDecimalString, minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Create or edit a plan.
 *
 * Prices are typed in rupees, the way an operator thinks of them, and turned
 * into integer paisa by string parsing, never float arithmetic. The `code` is
 * chosen once and then locked: it is how a subscription will point at the plan.
 */

const CYCLE_LABEL: Record<BillingCycle, string> = { MONTHLY: 'Monthly', YEARLY: 'Yearly' };
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

interface FormState {
  code: string;
  name: string;
  tagline: string;
  price: string;
  billingCycle: BillingCycle;
  studentCap: string;
  features: string;
  sortOrder: string;
  isPublic: boolean;
  isRecommended: boolean;
}

function initialState(plan: Plan | undefined): FormState {
  if (plan === undefined) {
    return {
      code: '',
      name: '',
      tagline: '',
      price: '',
      billingCycle: 'MONTHLY',
      studentCap: '',
      features: '',
      sortOrder: '0',
      isPublic: true,
      isRecommended: false,
    };
  }
  return {
    code: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    price: toDecimalString(minorUnits(plan.priceMinor)).replace(/\.00$/, ''),
    billingCycle: plan.billingCycle,
    studentCap: plan.studentCap === null ? '' : String(plan.studentCap),
    features: plan.features.join('\n'),
    sortOrder: String(plan.sortOrder),
    isPublic: plan.isPublic,
    isRecommended: plan.isRecommended,
  };
}

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined means create. */
  plan: Plan | undefined;
}) {
  // Remount per plan so the fields always start from the plan being edited.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <PlanForm key={plan?.id ?? 'new'} plan={plan} onDone={() => { onOpenChange(false); }} />
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ plan, onDone }: { plan: Plan | undefined; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = plan !== undefined;
  const [form, setForm] = useState<FormState>(() => initialState(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};

    const price = form.price.trim();
    if (!PRICE_PATTERN.test(price)) {
      next['priceMinor'] = 'Enter a price in rupees, like 4000 or 4000.50.';
    }
    const cap = form.studentCap.trim();
    if (cap !== '' && !/^\d+$/.test(cap)) {
      next['studentCap'] = 'Enter a whole number, or leave blank for no limit.';
    }
    const sort = form.sortOrder.trim() === '' ? '0' : form.sortOrder.trim();
    if (!/^\d+$/.test(sort)) {
      next['sortOrder'] = 'Enter a whole number.';
    }
    const features = form.features
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');

    if (Object.keys(next).length === 0) {
      const body = {
        name: form.name,
        tagline: form.tagline,
        priceMinor: fromDecimalString(price),
        billingCycle: form.billingCycle,
        studentCap: cap === '' ? null : Number(cap),
        features,
        isPublic: form.isPublic,
        isRecommended: form.isRecommended,
        sortOrder: Number(sort),
      };
      const parsed = isEdit
        ? updatePlanSchema.safeParse(body)
        : createPlanSchema.safeParse({ code: form.code, ...body });

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (typeof key === 'string' && next[key] === undefined) {
            next[key] = issue.message;
          }
        }
      } else {
        setErrors({});
        setIsPending(true);
        try {
          const response = await fetch(
            isEdit ? ROUTES.platform.plans.update(plan.id) : ROUTES.platform.plans.create,
            {
              method: isEdit ? 'PATCH' : 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(parsed.data),
            },
          );
          if (!response.ok) {
            const problem = (await response.json().catch(() => ({}))) as { detail?: string };
            showApiErrorToast(toast, 'Could not save the plan', problem.detail);
            return;
          }
          toast.success(isEdit ? 'Plan updated.' : 'Plan created.');
          onDone();
          router.refresh();
        } catch {
          showNetworkErrorToast(toast);
        } finally {
          setIsPending(false);
        }
        return;
      }
    }

    setErrors(next);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${plan.name}` : 'Add a plan'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Changes appear on the public pricing section within a minute.'
            : 'Public plans appear on the landing page pricing section.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors['name']} required>
            <Input
              value={form.name}
              maxLength={60}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          </Field>
          <Field
            label="Code"
            error={errors['code']}
            hint={isEdit ? 'Fixed once created.' : 'Short and permanent, like "standard".'}
            required
          >
            <Input
              value={form.code}
              disabled={isEdit}
              maxLength={31}
              onChange={(event) => {
                set('code', event.target.value);
              }}
            />
          </Field>
        </div>

        <Field label="Tagline" error={errors['tagline']} hint="Who this plan is for.">
          <Input
            value={form.tagline}
            maxLength={120}
            onChange={(event) => {
              set('tagline', event.target.value);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (Rs)" error={errors['priceMinor']} required>
            <Input
              inputMode="decimal"
              value={form.price}
              onChange={(event) => {
                set('price', event.target.value);
              }}
            />
          </Field>
          <Field label="Billed" error={errors['billingCycle']}>
            <SimpleSelect
              value={form.billingCycle}
              onValueChange={(value) => {
                set('billingCycle', value as BillingCycle);
              }}
              options={BILLING_CYCLES.map((cycle) => ({ value: cycle, label: CYCLE_LABEL[cycle] }))}
              ariaLabel="Billing cycle"
            />
          </Field>
          <Field label="Student limit" error={errors['studentCap']} hint="Blank = no limit.">
            <Input
              inputMode="numeric"
              value={form.studentCap}
              onChange={(event) => {
                set('studentCap', event.target.value);
              }}
            />
          </Field>
        </div>

        <Field
          label="Features"
          error={errors['features']}
          hint={`One per line, up to ${String(MAX_PLAN_FEATURES)}.`}
        >
          <Textarea
            rows={6}
            value={form.features}
            onChange={(event) => {
              set('features', event.target.value);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display order" error={errors['sortOrder']} hint="Lower shows first.">
            <Input
              inputMode="numeric"
              value={form.sortOrder}
              onChange={(event) => {
                set('sortOrder', event.target.value);
              }}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.isPublic}
              onCheckedChange={(value) => {
                set('isPublic', value === true);
              }}
            />
            Show on the public landing page
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.isRecommended}
              onCheckedChange={(value) => {
                set('isRecommended', value === true);
              }}
            />
            Highlight as the plan most schools pick (replaces the current one)
          </label>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button type="button" tone="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" isPending={isPending}>
          {isEdit ? 'Save changes' : 'Add plan'}
        </Button>
      </DialogFooter>
    </form>
  );
}
