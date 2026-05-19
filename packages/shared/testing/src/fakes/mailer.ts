export interface MailerLike {
  send(msg: { to: string; template: string; props: unknown }): Promise<void>;
}

export class FakeMailer implements MailerLike {
  readonly sent: Array<{ to: string; template: string; props: unknown }> = [];

  async send(msg: { to: string; template: string; props: unknown }): Promise<void> {
    this.sent.push(msg);
  }

  reset(): void {
    this.sent.length = 0;
  }
}
