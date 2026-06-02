import React from 'react';
import '@testing-library/jest-dom';

 
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Message,
  MessageContent,
  MessageAction,
  MessageBranch,
  MessageBranchContent,
  MessageBranchSelector,
  MessageBranchPrevious,
  MessageBranchNext,
  MessageBranchPage,
  MessageResponse,
  MessageAttachment,
  MessageAttachments,
  useMessageBranch,
} from '../src/components/ai-elements/message';

// Mock the UI components
jest.mock('../src/components/ui/button', () => ({
  Button: ({ children, className, ...props }: any) => (
    <button className={className} {...props}>{children}</button>
  ),
}));

jest.mock('../src/components/ui/button-group', () => ({
  ButtonGroup: ({ children, className, ...props }: any) => (
    <div className={className} {...props}>{children}</div>
  ),
  ButtonGroupText: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>{children}</span>
  ),
}));

jest.mock('../src/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronLeftIcon: () => <div data-testid="chevron-left">←</div>,
  ChevronRightIcon: () => <div data-testid="chevron-right">→</div>,
  PaperclipIcon: () => <div data-testid="paperclip">📎</div>,
  XIcon: () => <div data-testid="x">×</div>,
}));

// Mock internal Markdown component
jest.mock('../src/components/ai-elements/Markdown', () => ({
  __esModule: true,
  default: ({ content }: any) => <div>{content}</div>,
}));

describe('Message Components', () => {
  describe('Message', () => {
    it('renders user message with correct classes', () => {
      render(
        <Message from="user" data-testid="message">
          User message content
        </Message>
      );

      const message = screen.getByTestId('message');
      expect(message).toHaveClass('group', 'flex', 'w-full', 'max-w-[95%]', 'flex-col', 'gap-2');
      expect(message).toHaveClass('is-user', 'ml-auto', 'justify-end');
    });

    it('renders agent message with correct classes', () => {
      render(
        <Message from="agent" data-testid="message">
          Assistant message content
        </Message>
      );

      const message = screen.getByTestId('message');
      expect(message).toHaveClass('group', 'flex', 'w-full', 'max-w-[95%]', 'flex-col', 'gap-2');
      expect(message).toHaveClass('is-agent');
      expect(message).not.toHaveClass('is-user');
    });

    it('applies custom className', () => {
      render(
        <Message from="user" className="custom-class" data-testid="message">
          Content
        </Message>
      );

      const message = screen.getByTestId('message');
      expect(message).toHaveClass('custom-class');
    });

    it('passes through other props', () => {
      render(
        <Message from="user" data-testid="message" id="test-id">
          Content
        </Message>
      );

      const message = screen.getByTestId('message');
      expect(message).toHaveAttribute('id', 'test-id');
    });
  });

  describe('MessageContent', () => {
    it('renders content with correct classes', () => {
      render(
        <MessageContent data-testid="content">
          Message content
        </MessageContent>
      );

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('is-user:dark', 'flex', 'w-fit', 'max-w-full', 'min-w-0', 'flex-col', 'gap-2', 'overflow-hidden', 'text-sm');
    });

    it('applies custom className', () => {
      render(
        <MessageContent className="custom-content" data-testid="content">
          Content
        </MessageContent>
      );

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('custom-content');
    });

    it('renders children correctly', () => {
      render(
        <MessageContent>
          <span>Test content</span>
        </MessageContent>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });
  });

  describe('MessageAction', () => {
    it('renders button without tooltip', () => {
      render(
        <MessageAction label="Test Action">
          <span>Icon</span>
        </MessageAction>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(screen.getByText('Icon')).toBeInTheDocument();
    });

    it('renders button with tooltip', () => {
      render(
        <MessageAction tooltip="Test Tooltip" label="Test Action">
          <span>Icon</span>
        </MessageAction>
      );

      expect(screen.getByText('Test Tooltip')).toBeInTheDocument();
    });

    it('applies default variant and size', () => {
      render(
        <MessageAction label="Test Action">
          <span>Icon</span>
        </MessageAction>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('uses label for sr-only text when provided', () => {
      render(
        <MessageAction label="Test Label">
          <span>Icon</span>
        </MessageAction>
      );

      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('uses tooltip for sr-only text when label not provided', () => {
      render(
        <MessageAction tooltip="Test Tooltip">
          <span>Icon</span>
        </MessageAction>
      );

      const tooltipElements = screen.getAllByText('Test Tooltip');
      expect(tooltipElements.length).toBeGreaterThan(0);
    });
  });

  describe('MessageBranch', () => {
    it('renders with default branch', () => {
      render(
        <MessageBranch>
          <div>Branch content</div>
        </MessageBranch>
      );

      expect(screen.getByText('Branch content')).toBeInTheDocument();
    });

    it('calls onBranchChange when branch changes', () => {
      const onBranchChange = jest.fn();

      render(
        <MessageBranch onBranchChange={onBranchChange}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchNext />
        </MessageBranch>
      );

      const nextButton = screen.getByLabelText('Next branch');
      fireEvent.click(nextButton);

      expect(onBranchChange).toHaveBeenCalledWith(1);
    });

    it('applies custom className', () => {
      const { container } = render(
        <MessageBranch className="custom-branch">
          <div>Content</div>
        </MessageBranch>
      );

      const branchDiv = container.firstChild;
      expect(branchDiv).toHaveClass('custom-branch');
    });

    it('throws error when useMessageBranch is used outside MessageBranch', () => {
      // Create a test component that uses the hook outside of MessageBranch
      const TestComponent = () => {
        useMessageBranch();
        return <div>Test</div>;
      };

      // Expect the error to be thrown
      expect(() => {
        render(<TestComponent />);
      }).toThrow('MessageBranch components must be used within MessageBranch');
    });
  });

  describe('MessageBranchContent', () => {
    it('renders only current branch', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
        </MessageBranch>
      );

      expect(screen.getByText('Branch 1')).toBeVisible();
    });

    it('switches branches correctly', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchNext />
        </MessageBranch>
      );

      const nextButton = screen.getByLabelText('Next branch');
      fireEvent.click(nextButton);

      expect(screen.getByText('Branch 2')).toBeVisible();
    });
  });

  describe('MessageBranchSelector', () => {
    it('does not render when only one branch', () => {
      const { container } = render(
        <MessageBranch>
          <MessageBranchSelector from="agent" />
          <MessageBranchContent>
            <div key="1">Single Branch</div>
          </MessageBranchContent>
        </MessageBranch>
      );

      // Should not find ButtonGroup since it returns null
      const buttonGroup = container.querySelector('[orientation="horizontal"]');
      expect(buttonGroup).not.toBeInTheDocument();
    });

    it('renders when multiple branches exist', () => {
      const { container } = render(
        <MessageBranch>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchSelector from="agent" />
        </MessageBranch>
      );

      // ButtonGroup should render when there are multiple branches
      const buttonGroup = container.querySelector('[orientation="horizontal"]');
      expect(buttonGroup).toBeInTheDocument();
    });
  });

  describe('MessageBranchPrevious', () => {
    it('navigates to previous branch', () => {
      render(
        <MessageBranch defaultBranch={1}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchPrevious />
        </MessageBranch>
      );

      const prevButton = screen.getByLabelText('Previous branch');
      fireEvent.click(prevButton);

      expect(screen.getByText('Branch 1')).toBeVisible();
    });

    it('wraps to last branch from first', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
            <div key="3">Branch 3</div>
          </MessageBranchContent>
          <MessageBranchPrevious />
        </MessageBranch>
      );

      const prevButton = screen.getByLabelText('Previous branch');
      fireEvent.click(prevButton);

      expect(screen.getByText('Branch 3')).toBeVisible();
    });

    it('is disabled when only one branch', () => {
      render(
        <MessageBranch>
          <MessageBranchContent>
            <div key="1">Single Branch</div>
          </MessageBranchContent>
          <MessageBranchPrevious />
        </MessageBranch>
      );

      const prevButton = screen.getByLabelText('Previous branch');
      expect(prevButton).toBeDisabled();
    });
  });

  describe('MessageBranchNext', () => {
    it('navigates to next branch', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchNext />
        </MessageBranch>
      );

      const nextButton = screen.getByLabelText('Next branch');
      fireEvent.click(nextButton);

      expect(screen.getByText('Branch 2')).toBeVisible();
    });

    it('wraps to first branch from last', () => {
      render(
        <MessageBranch defaultBranch={1}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchNext />
        </MessageBranch>
      );

      const nextButton = screen.getByLabelText('Next branch');
      fireEvent.click(nextButton);

      expect(screen.getByText('Branch 1')).toBeVisible();
    });

    it('is disabled when only one branch', () => {
      render(
        <MessageBranch>
          <MessageBranchContent>
            <div key="1">Single Branch</div>
          </MessageBranchContent>
          <MessageBranchNext />
        </MessageBranch>
      );

      const nextButton = screen.getByLabelText('Next branch');
      expect(nextButton).toBeDisabled();
    });
  });

  describe('MessageBranchPage', () => {
    it('displays current page and total', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
            <div key="3">Branch 3</div>
          </MessageBranchContent>
          <MessageBranchPage />
        </MessageBranch>
      );

      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('updates when branch changes', () => {
      render(
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <div key="1">Branch 1</div>
            <div key="2">Branch 2</div>
          </MessageBranchContent>
          <MessageBranchNext />
          <MessageBranchPage />
        </MessageBranch>
      );

      expect(screen.getByText('1 of 2')).toBeInTheDocument();

      const nextButton = screen.getByLabelText('Next branch');
      fireEvent.click(nextButton);

      expect(screen.getByText('2 of 2')).toBeInTheDocument();
    });
  });

  describe('MessageResponse', () => {
    it('renders Streamdown component', () => {
      render(
        <MessageResponse>
          Response content
        </MessageResponse>
      );

      expect(screen.getByText('Response content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <MessageResponse className="custom-response">
          Content
        </MessageResponse>
      );

      // Streamdown wraps content, so check that className was passed through
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('MessageAttachment', () => {
    it('renders image attachment', () => {
      const data = {
        type: 'file' as const,
        filename: 'test.jpg',
        mediaType: 'image/jpeg',
        url: 'https://example.com/test.jpg',
      };

      render(<MessageAttachment data={data} />);

      const img = screen.getByAltText('test.jpg');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/test.jpg');
    });

    it('renders file attachment without image', () => {
      const data = {
        type: 'file' as const,
        filename: 'test.pdf',
        mediaType: 'application/pdf',
        url: 'https://example.com/test.pdf',
      };

      render(<MessageAttachment data={data} />);

      expect(screen.getByTestId('paperclip')).toBeInTheDocument();
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    it('shows remove button on image hover', () => {
      const onRemove = jest.fn();
      const data = {
        type: 'file' as const,
        filename: 'test.jpg',
        mediaType: 'image/jpeg',
        url: 'https://example.com/test.jpg',
      };

      render(<MessageAttachment data={data} onRemove={onRemove} />);

      const removeButton = screen.getByLabelText('Remove attachment');
      expect(removeButton).toBeInTheDocument();
    });

    it('calls onRemove when remove button clicked', () => {
      const onRemove = jest.fn();
      const data = {
        type: 'file' as const,
        filename: 'test.jpg',
        mediaType: 'image/jpeg',
        url: 'https://example.com/test.jpg',
      };

      render(<MessageAttachment data={data} onRemove={onRemove} />);

      const removeButton = screen.getByLabelText('Remove attachment');
      fireEvent.click(removeButton);

      expect(onRemove).toHaveBeenCalled();
    });

    it('uses default label when filename is empty', () => {
      const data = {
        type: 'file' as const,
        filename: '',
        mediaType: 'image/jpeg',
        url: 'https://example.com/test.jpg',
      };

      render(<MessageAttachment data={data} />);

      const img = screen.getByAltText('attachment');
      expect(img).toBeInTheDocument();
    });

    it('uses "Attachment" label for file without filename', () => {
      const data = {
        type: 'file' as const,
        filename: '',
        mediaType: 'application/pdf',
        url: 'https://example.com/test.pdf',
      };

      render(<MessageAttachment data={data} />);

      expect(screen.getByText('Attachment')).toBeInTheDocument();
    });

    it('renders file attachment with remove button', () => {
      const onRemove = jest.fn();
      const data = {
        type: 'file' as const,
        filename: 'document.pdf',
        mediaType: 'application/pdf',
        url: 'https://example.com/document.pdf',
      };

      render(<MessageAttachment data={data} onRemove={onRemove} />);

      const removeButton = screen.getByLabelText('Remove attachment');
      fireEvent.click(removeButton);

      expect(onRemove).toHaveBeenCalled();
    });
  });

  describe('MessageAttachments', () => {
    it('renders children when provided', () => {
      render(
        <MessageAttachments>
          <div>Attachment 1</div>
          <div>Attachment 2</div>
        </MessageAttachments>
      );

      expect(screen.getByText('Attachment 1')).toBeInTheDocument();
      expect(screen.getByText('Attachment 2')).toBeInTheDocument();
    });

    it('returns null when no children', () => {
      const { container } = render(<MessageAttachments />);

      expect(container.firstChild).toBeNull();
    });

    it('applies custom className', () => {
      const { container } = render(
        <MessageAttachments className="custom-attachments">
          <div>Attachment</div>
        </MessageAttachments>
      );

      expect(container.firstChild).toHaveClass('custom-attachments');
    });
  });
});