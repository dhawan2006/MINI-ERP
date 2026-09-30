import React from 'react';
import { SearchInput } from './SearchInput';
import { SearchResults } from './SearchResults';
import { useNavigationStore } from '../../../application/state/navigationStore';
import { getModifierKey } from '../../utils/platform';
import { Button } from '../ui/Button';
import { KeyboardHint } from '../ui/KeyboardHint';

interface SearchPanelProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ inputRef }) => {
  const navigateTo = useNavigationStore(state => state.navigateTo);

  return (
    <div className="flex flex-col h-full">
      <div className="p-8 border-b border-[var(--color-border)] bg-[var(--color-bg-app)]">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Mini POS For Harji</h1>
          <div className="flex gap-3">
            <Button 
              variant="secondary"
              onClick={() => navigateTo('products')}
              title={`Products (${getModifierKey()} + P)`}
            >
              <div className="flex items-center gap-2">
                Products
                <KeyboardHint shortcut={`${getModifierKey()} P`} className="hidden sm:flex" />
              </div>
            </Button>
            <Button 
              variant="secondary"
              onClick={() => navigateTo('history')}
              title={`Bill History (${getModifierKey()} + H)`}
            >
              <div className="flex items-center gap-2">
                History
                <KeyboardHint shortcut={`${getModifierKey()} H`} className="hidden sm:flex" />
              </div>
            </Button>
            <Button 
              variant="secondary"
              onClick={() => navigateTo('settings')}
              title={`Settings (${getModifierKey()} + ,)`}
            >
              <div className="flex items-center gap-2">
                Settings
                <KeyboardHint shortcut={`${getModifierKey()} ,`} className="hidden sm:flex" />
              </div>
            </Button>
          </div>
        </div>
        <SearchInput inputRef={inputRef} />
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <SearchResults />
      </div>
    </div>
  );
};
