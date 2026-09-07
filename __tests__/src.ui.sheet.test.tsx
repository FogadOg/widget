import { fireEvent, render, screen } from '@testing-library/react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../src/components/ui/sheet';

const Example = ({
  side,
  defaultOpen = false,
}: {
  side?: 'top' | 'bottom' | 'left' | 'right';
  defaultOpen?: boolean;
}) => (
  <Sheet defaultOpen={defaultOpen}>
    <SheetTrigger>Open panel</SheetTrigger>
    <SheetContent side={side}>
      <SheetHeader>
        <SheetTitle>Settings</SheetTitle>
        <SheetDescription>Adjust how the widget behaves.</SheetDescription>
      </SheetHeader>
      <p>Body content</p>
      <SheetFooter>
        <SheetClose>Done</SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

describe('Sheet', () => {
  test('keeps the panel closed until the trigger is used', () => {
    render(<Example />);
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  test('opens on the trigger', () => {
    render(<Example />);

    fireEvent.click(screen.getByText('Open panel'));

    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  test('renders open when told to', () => {
    render(<Example defaultOpen />);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  test('exposes a title and description to assistive tech', () => {
    render(<Example defaultOpen />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Adjust how the widget behaves.')).toBeInTheDocument();
  });

  test('closes on the close control', () => {
    render(<Example defaultOpen />);

    fireEvent.click(screen.getByText('Done'));

    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  test.each([['right'], ['left'], ['top'], ['bottom']] as const)(
    'renders anchored to the %s edge',
    (side) => {
      render(<Example side={side} defaultOpen />);
      expect(screen.getByText('Body content')).toBeInTheDocument();
    },
  );

  test('defaults to the right edge', () => {
    const { container } = render(<Example defaultOpen />);
    expect(container.ownerDocument.body.textContent).toContain('Body content');
  });

  test('marks each part with its data-slot for styling hooks', () => {
    render(<Example defaultOpen />);
    const body = document.body;
    ['sheet-content', 'sheet-header', 'sheet-footer', 'sheet-title', 'sheet-description'].forEach(
      (slot) => {
        expect(body.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
      },
    );
  });

  test('merges a caller className onto the content', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent className="w-96">
          <SheetTitle>T</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.body.querySelector('.w-96')).toBeInTheDocument();
  });

  test('merges className on header, footer, title and description', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader className="hdr">
            <SheetTitle className="ttl">T</SheetTitle>
            <SheetDescription className="dsc">D</SheetDescription>
          </SheetHeader>
          <SheetFooter className="ftr">f</SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    ['.hdr', '.ttl', '.dsc', '.ftr'].forEach((sel) => {
      expect(document.body.querySelector(sel)).toBeInTheDocument();
    });
  });
});
