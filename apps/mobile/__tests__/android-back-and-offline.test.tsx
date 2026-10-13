import { fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, Text } from 'react-native';

import { Button } from '@/components/Button';
import { OfflineBanner } from '@/components/Layout';
import { OptionSheet, Sheet } from '@/components/Sheet';
import { useState } from 'react';

import { Providers } from './helpers/render';

const Network = jest.requireMock('expo-network') as { useNetworkState: jest.Mock; getNetworkStateAsync: jest.Mock };

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Text testID="state">{open ? 'offen' : 'geschlossen'}</Text>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Position bearbeiten">
        <Text>Inhalt</Text>
      </Sheet>
    </>
  );
}

describe('Android hardware back', () => {
  it('closes an open bottom sheet first (Modal onRequestClose) instead of leaving the screen', () => {
    render(
      <Providers>
        <SheetHarness />
      </Providers>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('offen');
    // The hardware back button is delivered to the topmost Modal as onRequestClose.
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(screen.getByTestId('state')).toHaveTextContent('geschlossen');
  });

  it('option sheets select and close; the close button is labelled for screen readers', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(
      <Providers>
        <OptionSheet visible title="Besteuerung" onClose={onClose} onSelect={onSelect} options={[{ value: 'Standard', label: 'Regelbesteuerung' }]} selected="Standard" />
      </Providers>,
    );
    expect(screen.getByRole('radio', { name: 'Regelbesteuerung' }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('option-Standard'));
    expect(onSelect).toHaveBeenCalledWith('Standard');
    expect(onClose).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('offline behaviour', () => {
  afterEach(() => Network.useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true }));

  it('shows the offline banner with a retry action only while offline', async () => {
    Network.useNetworkState.mockReturnValue({ isConnected: false });
    const { rerender } = render(
      <Providers>
        <OfflineBanner />
      </Providers>,
    );
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Verbindung erneut prüfen'));
    expect(Network.getNetworkStateAsync).toHaveBeenCalled();

    Network.useNetworkState.mockReturnValue({ isConnected: true });
    rerender(
      <Providers>
        <OfflineBanner />
      </Providers>,
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});

describe('accessibility basics', () => {
  it('buttons expose role, label and busy/disabled state', () => {
    render(<Button label="Speichern" loading onPress={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});
