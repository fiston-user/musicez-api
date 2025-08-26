describe('Debug App Creation', () => {
  it('should import createApp function', async () => {
    const module = await import('../src/app');
    expect(module.createApp).toBeDefined();
    expect(typeof module.createApp).toBe('function');
  });

  it('should create app instance', async () => {
    const { createApp } = await import('../src/app');
    const app = createApp();
    expect(app).toBeDefined();
    expect(app.listen).toBeDefined();
  });
});