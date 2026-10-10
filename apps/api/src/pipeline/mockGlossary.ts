/**
 * Small glossary used only by the mock LLM backend (mock.ts) so demo concepts read
 * like a model's output on the CS229 demo lectures: when an alias appears in the
 * transcript the concept gets this canonical name and textbook definition.
 * Aliases are lowercase and matched on word boundaries.
 */
export interface GlossaryEntry { name: string; aliases: string[]; def: string }

export const GLOSSARY: GlossaryEntry[] = [
  { name: "Gaussian Distribution", aliases: ["gaussian", "gaussians", "normal distribution", "normal distributions", "the normal"], def: "A continuous bell-shaped distribution fully described by its mean (centre) and variance (spread); written z ~ N(mu, sigma^2)." },
  { name: "Variance", aliases: ["variance", "variances", "sigma squared"], def: "The expected squared distance of a random variable from its mean; sigma^2 for a Gaussian." },
  { name: "Standard Deviation", aliases: ["standard deviation", "standard deviations"], def: "The square root of the variance, sigma; spread measured in the variable's own units." },
  { name: "Expected Value", aliases: ["expected value", "expectation", "the mean"], def: "The probability-weighted average of a random variable; the centre (mu) of a Gaussian." },
  { name: "Covariance", aliases: ["covariance", "covariance matrix"], def: "How two random variables vary together; the multivariate generalisation of variance." },
  { name: "Error Term", aliases: ["error term", "epsilon", "epsilons", "noise", "the errors", "the error"], def: "The random part of a model, y = theta^T x + epsilon: what the deterministic model does not explain, often assumed Gaussian with mean zero." },
  { name: "Probability Density Function", aliases: ["probability distribution", "probability function", "density function", "probability density"], def: "A function giving the relative likelihood of each value of a continuous random variable; it integrates to one." },
  { name: "Normalizing Constant", aliases: ["normalizing constant", "normalization constant", "normalize"], def: "The factor in front of a density that makes it integrate to one; often drops out when optimising." },
  { name: "Likelihood", aliases: ["likelihood", "likelihoods", "how likely"], def: "The probability of the observed data viewed as a function of the model parameters." },
  { name: "Maximum Likelihood Estimation", aliases: ["maximum likelihood", "mle"], def: "Choosing parameters that make the observed data most probable under the model." },
  { name: "Least Squares", aliases: ["least squares", "squared error", "sum of squares"], def: "Fitting parameters by minimising the sum of squared residuals; equivalent to maximum likelihood under Gaussian noise." },
  { name: "Linear Regression", aliases: ["linear regression", "linear model"], def: "Predicting a real-valued output as a linear function of the inputs, y = theta^T x." },
  { name: "Generalized Linear Models", aliases: ["generalized linear models", "generalized linear model", "glms", "glm"], def: "A family of models that put a linear predictor inside an exponential-family distribution, unifying linear and logistic regression." },
  { name: "Exponential Family", aliases: ["exponential family", "exponential"], def: "Distributions whose density can be written as an exponential of a linear function of sufficient statistics; Gaussians are one example." },
  { name: "Law of Large Numbers", aliases: ["law of large numbers"], def: "With enough independent samples, the sample average converges to the expected value." },
  { name: "Central Limit Theorem", aliases: ["central limit theorem", "clt", "clts"], def: "Sums of many independent bounded random variables are approximately Gaussian, which is why Gaussian error models often work well." },
  { name: "Model Parameters (Theta)", aliases: ["theta", "parameters", "parameter"], def: "The values theta that a model learns from data; with the right theta the model predicts the deterministic part of y." },
  { name: "Conditional Distribution", aliases: ["conditioned on", "conditional distribution", "given theta"], def: "The distribution of one variable given the value of another, e.g. p(y | x; theta)." },
  { name: "Logistic Regression", aliases: ["logistic regression", "sigmoid"], def: "A classification model that passes a linear function through the sigmoid to output a probability." },
  { name: "Gradient Descent", aliases: ["gradient descent", "gradient"], def: "Iteratively updating parameters in the direction that most reduces the loss." },
  { name: "Loss Function", aliases: ["loss function", "cost function", "objective"], def: "A function measuring how badly the model fits the data; training minimises it." },
  { name: "Derivative", aliases: ["derivative", "derivatives", "take a derivative"], def: "The rate of change of a function; set to zero to find a minimum or maximum." },
  { name: "Overfitting", aliases: ["overfitting", "overfit"], def: "Fitting noise in the training data so the model generalises poorly." },
  { name: "Regularization", aliases: ["regularization", "regularisation"], def: "Penalising model complexity to reduce overfitting." },
  { name: "Bias-Variance Tradeoff", aliases: ["bias variance", "bias-variance"], def: "The balance between error from overly simple assumptions (bias) and from sensitivity to the training data (variance)." },
  { name: "Feature", aliases: ["features", "feature vector"], def: "An input variable x used by the model to make a prediction." },
  { name: "Training Set", aliases: ["training set", "training data", "training examples"], def: "The labelled examples the model's parameters are fitted on." },
  { name: "Neural Network", aliases: ["neural network", "neural networks"], def: "A model built from layers of linear maps and nonlinear activations, trained by gradient descent." },
];
