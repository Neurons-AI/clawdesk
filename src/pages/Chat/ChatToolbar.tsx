/**
 * Chat Toolbar
 * Session selector, model selector, new session, refresh, and thinking toggle.
 * Rendered in the Header when on the Chat page.
 */
import { useMemo } from 'react';
import { RefreshCw, Brain, ChevronDown, Plus, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/stores/chat';
import { useModelsStore } from '@/stores/models';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function ChatToolbar() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const refresh = useChatStore((s) => s.refresh);
  const loading = useChatStore((s) => s.loading);
  const showThinking = useChatStore((s) => s.showThinking);
  const toggleThinking = useChatStore((s) => s.toggleThinking);

  const models = useModelsStore((s) => s.models);
  const selectedModel = useModelsStore((s) => s.selectedModel);
  const setSelectedModel = useModelsStore((s) => s.setSelectedModel);

  const { t } = useTranslation('chat');

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    switchSession(e.target.value);
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedModel(value || null);
  };

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof models> = {};
    for (const model of models) {
      const provider = model.provider || 'other';
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }
    return groups;
  }, [models]);

  const providers = Object.keys(groupedModels).sort();

  return (
    <div className="flex items-center gap-2">
      {/* Session Selector */}
      <div className="relative">
        <select
          value={currentSessionKey}
          onChange={handleSessionChange}
          className={cn(
            'appearance-none rounded-md border border-border bg-background px-3 py-1.5 pr-8',
            'text-sm text-foreground cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          )}
        >
          {/* Render all sessions; if currentSessionKey is not in the list, add it */}
          {!sessions.some((s) => s.key === currentSessionKey) && (
            <option value={currentSessionKey}>
              {currentSessionKey}
            </option>
          )}
          {sessions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>

      {/* Model Selector */}
      {models.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Cpu className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={selectedModel || ''}
                onChange={handleModelChange}
                className={cn(
                  'appearance-none rounded-md border border-border bg-background pl-7 pr-7 py-1.5',
                  'text-sm cursor-pointer max-w-[180px]',
                  selectedModel ? 'text-foreground' : 'text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                <option value="">{t('toolbar.model.default')}</option>
                {providers.map((provider) => (
                  <optgroup key={provider} label={provider}>
                    {groupedModels[provider].map((model) => (
                      <option
                        key={`${model.provider}/${model.id}`}
                        value={`${model.provider}/${model.id}`}
                      >
                        {model.name || model.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('toolbar.model.select')}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* New Session */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={newSession}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('toolbar.newSession')}</p>
        </TooltipContent>
      </Tooltip>

      {/* Refresh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('toolbar.refresh')}</p>
        </TooltipContent>
      </Tooltip>

      {/* Thinking Toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              showThinking && 'bg-primary/10 text-primary',
            )}
            onClick={toggleThinking}
          >
            <Brain className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{showThinking ? t('toolbar.hideThinking') : t('toolbar.showThinking')}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
