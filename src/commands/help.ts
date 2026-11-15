import { AGENTS } from '../agents';
import { DOCS_URL } from '../core/account';
import { cmd, INVOCATION, SHORT_COMMAND } from '../core/invocation';
import { bold, dim, padEnd } from '../core/ui';
import { PACKAGE_NAME, VERSION } from '../core/version';
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
      [cmd(), m.helpCmdHub],
      [cmd('<agent> [args…]'), m.helpCmdLaunch],
      [cmd('setup [agent…]'), m.helpCmdSetup],
      [cmd('reset [agent…]'), m.helpCmdReset],
      [cmd('login'), m.helpCmdLogin],
      [cmd('logout'), m.helpCmdLogout],
      [cmd('models [search…]'), m.helpCmdModels],
      [cmd('status'), m.helpCmdStatus],
      [cmd('doctor'), m.helpCmdDoctor],
      [cmd('endpoint [region|url|auto]'), m.helpCmdEndpoint],
      [cmd('update'), m.helpCmdUpdate],
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
    `  ${cmd('claude')}`,
    `  ${cmd('codex --model openai/gpt-5.5')}`,
    `  ${cmd('claude --model zhipu/glm-5.3 -p "review this diff"')}`,
    `  ${cmd('opencode --pick')}`,
    `  ${cmd('setup claude codex')}`,
    '',
    dim(m.helpPassThrough),
    dim(m.helpDoubleDash),
    dim(
      INVOCATION.npx
        ? m.helpShortInstall(`npm install -g ${PACKAGE_NAME}`, cmd('claude', SHORT_COMMAND))
        : m.helpShort(SHORT_COMMAND, PACKAGE_NAME),
    ),
    '',
    `${m.helpDocs}: ${DOCS_URL}`,
  ].join('\n');
}
