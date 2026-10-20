// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricCard, StatTile } from '@/components/metrics';
import { ProductPreview } from '@/components/product-preview';
import { Alert, Badge, EmptyState, Field, Input } from '@/components/ui';
import { BarList, MonthlyColumns } from '@/components/charts';
import type { Metric } from '@/lib/analytics';

afterEach(cleanup);

const available: Metric = {
  key: 'available_reported',
  label: 'Available, as reported',
  description: 'Remaining balance on records that are unverified, available or partially used.',
  byCurrency: { INR: 60_000, USD: 2_500 },
  count: 3,
  tone: 'neutral',
};

const verified: Metric = {
  key: 'verified_available',
  label: 'Of which you have verified',
  description: 'The part of the figure above that you confirmed with the provider.',
  byCurrency: { INR: 40_000 },
  count: 1,
  subsetOf: 'available_reported',
  tone: 'positive',
};

describe('MetricCard', () => {
  it('shows the amount in the chosen currency', () => {
    render(<MetricCard metric={available} currency="INR" />);
    expect(screen.getByText(/600\.00/)).toBeDefined(); // 60,000 paise
    expect(screen.getByText('3 records')).toBeDefined();
  });

  it('lists other currencies separately and says they are not converted', () => {
    render(<MetricCard metric={available} currency="INR" />);
    const note = screen.getByText(/kept separate, no conversion rate/i);
    expect(note.textContent).toMatch(/\$25\.00|USD/);
  });

  it('marks a subset so it cannot be read as extra money', () => {
    render(<MetricCard metric={verified} currency="INR" />);
    expect(screen.getByText(/part of the figure above/i)).toBeDefined();
  });

  it('exposes the definition to assistive technology', () => {
    render(<MetricCard metric={available} currency="INR" />);
    const explain = screen.getByRole('note');
    expect(explain.getAttribute('aria-label')).toBe(available.description);
  });

  it('renders a plain count tile', () => {
    render(
      <StatTile
        label="Unresolved claims"
        value={2}
        note="open cases"
        explain="Cases not yet confirmed."
      />,
    );
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('open cases')).toBeDefined();
  });
});

describe('ProductPreview', () => {
  it('labels its data as an example', () => {
    render(<ProductPreview />);
    expect(screen.getByText('Example data')).toBeDefined();
    expect(screen.getByText(/Illustration with invented records/i)).toBeDefined();
  });

  it('switches panels when a tab is chosen', async () => {
    const user = userEvent.setup();
    render(<ProductPreview />);

    expect(screen.getByText('Available, as reported')).toBeDefined();

    await user.click(screen.getByRole('tab', { name: /needs attention/i }));
    expect(screen.getByText(/Lifestyle Store credit note/i)).toBeDefined();
    expect(screen.queryByText('Available, as reported')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /recovery activity/i }));
    expect(screen.getByText(/Refund received from Marigold Travel/i)).toBeDefined();
  });

  it('keeps the selected tab marked for screen readers', async () => {
    const user = userEvent.setup();
    render(<ProductPreview />);
    const tab = screen.getByRole('tab', { name: /needs attention/i });
    await user.click(tab);
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('form primitives', () => {
  it('links a label, a hint and an error to the control', () => {
    render(
      <Field
        label="Amount used"
        name="amount"
        required
        error="Enter a valid amount."
        hint="For example 500.00"
      >
        <Input id="amount" name="amount" />
      </Field>,
    );
    const input = screen.getByLabelText(/Amount used/);
    expect(input.getAttribute('name')).toBe('amount');
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid amount.');
    expect(screen.getByText('For example 500.00')).toBeDefined();
  });

  it('marks optional fields as optional rather than leaving it ambiguous', () => {
    render(
      <Field label="Notes" name="notes">
        <Input id="notes" name="notes" />
      </Field>,
    );
    expect(screen.getByText('(optional)')).toBeDefined();
  });

  it('announces a danger alert immediately', () => {
    render(
      <Alert tone="danger" title="This cannot be undone">
        Deleting removes the history.
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('This cannot be undone')).toBeDefined();
  });

  it('renders an empty state with a way forward', () => {
    render(
      <EmptyState
        title="No benefits yet"
        description="Add one to get started."
        action={<button>Add</button>}
      />,
    );
    expect(screen.getByText('No benefits yet')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDefined();
  });

  it('renders a badge with its explanatory title', () => {
    render(
      <Badge tone="warning" title="Recorded expiry is close">
        Expires in 3d
      </Badge>,
    );
    expect(screen.getByTitle('Recorded expiry is close').textContent).toBe('Expires in 3d');
  });
});

describe('charts', () => {
  it('describes the data in text for screen readers', () => {
    render(
      <MonthlyColumns
        data={[
          { month: '2026-09', refunds: 10_000, credits: 0 },
          { month: '2026-10', refunds: 0, credits: 5_000 },
        ]}
        currency="INR"
      />,
    );
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(/2026-09/);
    expect(img.getAttribute('aria-label')).toMatch(/Confirmed recovery by month/i);
  });

  it('says so plainly when there is nothing to chart', () => {
    render(<MonthlyColumns data={[{ month: '2026-10', refunds: 0, credits: 0 }]} currency="INR" />);
    expect(screen.getByText(/Nothing confirmed as recovered yet/i)).toBeDefined();
  });

  it('renders a bar list with an empty message', () => {
    render(<BarList items={[]} currency="INR" emptyLabel="No outstanding value." />);
    expect(screen.getByText('No outstanding value.')).toBeDefined();
  });

  it('renders one row per item', () => {
    render(
      <BarList
        items={[
          { label: 'Gift card', value: 50_000 },
          { label: 'Store credit', value: 25_000 },
        ]}
        currency="INR"
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Gift card')).toBeDefined();
  });
});
