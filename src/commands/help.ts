import { AGENTS } from '../agents';
import { DOCS_URL } from '../core/account';
import { bold, dim, padEnd } from '../core/ui';
import { VERSION } from '../core/version';
import { t } from '../i18n';

const rows = (entries: Array<[string, string]>): string[] => {
  const width = Math.max(...entries.map(([left]) => left.length));
  return entries.map(([left, right]) => `  ${padEnd(left, width)}  ${dim(right)}`);
};

export function helpText(): string {
  const m = t();
  return [
    `${bold('omgvibe')} ${VERSION}  ${dim(m.tagline)}`,
    '',
    bold(m.helpUsage),
    ...rows([
      ['omgvibe', m.helpCmdHub],
      ['omgvibe <agent> [args…]', m.helpCmdLaunch],
      ['omgvibe setup [agent…]', m.helpCmdSetup],
      ['omgvibe reset [agent…]', m.helpCmdReset],
      ['omgvibe login', m.helpCmdLogin],
      ['omgvibe logout', m.helpCmdLogout],
      ['omgvibe models [search…]', m.helpCmdModels],
      ['omgvibe status', m.helpCmdStatus],
      ['omgvibe doctor', m.helpCmdDoctor],
      ['omgvibe endpoint [region|url|auto]', m.helpCmdEndpoint],
      ['omgvibe update', m.helpCmdUpdate],
    ]),
    '',
    bold(m.helpAgents),
    ...rows(AGENTS.map((agent) => [agent.id, `${agent.name}${agent.setup ? '' : `  (${m.statusSetupNone})`}`])),
    '',
    bold(m.helpOptions),
    ...rows([
      ['-m, --model <id>', m.helpOptModel],
      ['    --pick', m.helpOptPick],
      ['    --endpoint <region|url>', m.helpOptEndpoint],
      ['    --key <key>', m.helpOptKey],
      ['    --lang <en|zh|ja>', m.helpOptLang],
      ['    --install', m.helpOptInstall],
      ['-y, --yes', m.helpOptYes],
      ['    --json', m.helpOptJson],
      ['-h, --help', m.helpOptHelp],
      ['-v, --version', m.helpOptVersion],
    ]),
    '',
    bold(m.helpExamples),
    '  omgvibe claude',
    '  omgvibe codex --model openai/gpt-5.5',
    '  omgvibe claude --model zhipu/glm-5.3 -p "review this diff"',
    '  omgvibe opencode --pick',
    '  omgvibe setup claude codex',
    '',
    dim(m.helpPassThrough),
    dim(m.helpDoubleDash),
    '',
    `${m.helpDocs}: ${DOCS_URL}`,
  ].join('\n');
}
