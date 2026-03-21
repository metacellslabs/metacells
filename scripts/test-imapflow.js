import { ImapFlow } from 'imapflow';

const CONFIG = {
  host: 'imap.mail.us-east-1.awsapps.com',
  port: 993,
  secure: true,
  auth: {
    user: 'yuriy.zubarovskiy@superfolders.com',
    pass: 'GvLR9PjcCqMTysh#',
  },
  mailbox: 'INBOX',
};

function formatError(error) {
  if (!error) return '';
  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors
      .map((item) => formatError(item))
      .filter(Boolean)
      .join('; ');
  }
  if (error.cause) {
    const causeMessage = formatError(error.cause);
    if (causeMessage) return causeMessage;
  }
  return String(error.message || error.code || error || '').trim();
}

async function main() {
  const client = new ImapFlow({
    host: CONFIG.host,
    port: CONFIG.port,
    secure: CONFIG.secure,
    auth: {
      user: CONFIG.auth.user,
      pass: CONFIG.auth.pass,
    },
    logger: false,
  });

  try {
    console.log('[imapflow-test] connect.start', {
      host: CONFIG.host,
      port: CONFIG.port,
      secure: CONFIG.secure,
      user: CONFIG.auth.user,
    });

    await client.connect();

    console.log('[imapflow-test] connect.success');

    const lock = await client.mailboxOpen(CONFIG.mailbox);

    console.log('[imapflow-test] mailbox.open.success', {
      path: lock.path,
      exists: lock.exists,
      uidNext: lock.uidNext,
    });

    const messages = [];
    for await (const message of client.fetch(
      '1:*',
      {
        uid: true,
        envelope: true,
        internalDate: true,
      },
      { uid: false },
    )) {
      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject || '',
        from: Array.isArray(message.envelope?.from)
          ? message.envelope.from.map((item) => item.address).filter(Boolean)
          : [],
        date: message.internalDate || null,
      });

      if (messages.length >= 5) break;
    }

    console.log('[imapflow-test] fetch.success', {
      mailbox: CONFIG.mailbox,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('[imapflow-test] failed', {
      message: formatError(error),
      name: error?.name || '',
      code: error?.code || '',
      stack: error?.stack || '',
    });
    process.exitCode = 1;
  } finally {
    try {
      await client.logout();
      console.log('[imapflow-test] logout.success');
    } catch (error) {
      console.error('[imapflow-test] logout.failed', {
        message: formatError(error),
      });
    }
  }
}

main();
