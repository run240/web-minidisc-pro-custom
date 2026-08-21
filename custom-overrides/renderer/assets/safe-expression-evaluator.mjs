export function evaluateArithmeticExpression(expression) {
  const compact = String(expression).replace(/\s+/g, "");
  const tokens = compact.match(/0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  if (!compact || tokens.join("") !== compact) {
    throw new Error("Unsupported assembler expression");
  }

  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  const parsePrimary = () => {
    const token = consume();
    if (token === "+") return parsePrimary();
    if (token === "-") return -parsePrimary();
    if (token === "(") {
      const value = parseAdditive();
      if (consume() !== ")") throw new Error("Unclosed assembler expression");
      return value;
    }
    if (!token || !/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(token)) {
      throw new Error("Invalid assembler expression token");
    }
    return Number(token);
  };

  const parseMultiplicative = () => {
    let value = parsePrimary();
    while (["*", "/", "%"].includes(peek())) {
      const operator = consume();
      const right = parsePrimary();
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  };

  function parseAdditive() {
    let value = parseMultiplicative();
    while (["+", "-"].includes(peek())) {
      const operator = consume();
      const right = parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseAdditive();
  if (position !== tokens.length || !Number.isFinite(result)) {
    throw new Error("Invalid assembler expression result");
  }
  return result;
}
