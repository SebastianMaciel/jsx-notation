// Edge cases: spread, namespace, computed className, boolean props, render props
const EdgeCases = () => (
  <div>
    <Component {...props} extra="val" />
    <Form.Input name="field" />
    <div className={cn('base', { active: isActive })}>Dynamic</div>
    <Button disabled>Click</Button>
    <DataProvider>
      {(data) => <span>{data.value}</span>}
    </DataProvider>
  </div>
);
