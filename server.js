const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// In-memory storage for templates and compatibility rules
const templates = {};

// Helper function to validate request body
function validateRequestBody(requiredFields, body) {
    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
        return `Missing required fields: ${missingFields.join(', ')}`;
    }
    return null;
}

// 1. Add Compatibility Rule
app.post('/product-templates/:template_str_id/compatibility-rules', (req, res) => {
    const { template_str_id } = req.params;
    const { rule_type, primary_choice_str_id, secondary_choice_str_id } = req.body;

    const validationError = validateRequestBody(['rule_type', 'primary_choice_str_id', 'secondary_choice_str_id'], req.body);
    if (validationError) {
        return res.status(400).send({ error: validationError });
    }

    if (!templates[template_str_id]) {
        templates[template_str_id] = { compatibilityRules: [], options: {}, base_price: 0 };
    }

    templates[template_str_id].compatibilityRules.push({
        rule_type,
        primary_choice_str_id,
        secondary_choice_str_id,
    });

    res.status(200).send({ message: 'Compatibility rule added successfully.' });
});

// 2. Get Available Options for a Category
app.post('/product-templates/:template_str_id/available-options/:target_category_str_id', (req, res) => {
    const { template_str_id, target_category_str_id } = req.params;
    const { currentSelections } = req.body;

    const validationError = validateRequestBody(['currentSelections'], req.body);
    if (validationError) {
        return res.status(400).send({ error: validationError });
    }

    const template = templates[template_str_id];
    if (!template) {
        return res.status(404).send({ error: 'Template not found.' });
    }

    const validOptions = Object.entries(template.options[target_category_str_id] || {})
        .filter(([choice_str_id, option]) => {
            return template.compatibilityRules.every((rule) => {
                if (rule.rule_type === 'REQUIRES' && currentSelections[rule.primary_choice_str_id] === rule.primary_choice_str_id) {
                    return currentSelections[rule.secondary_choice_str_id] === rule.secondary_choice_str_id;
                }
                if (rule.rule_type === 'INCOMPATIBLE_WITH' && currentSelections[rule.primary_choice_str_id] === rule.primary_choice_str_id) {
                    return currentSelections[rule.secondary_choice_str_id] !== rule.secondary_choice_str_id;
                }
                return true;
            });
        })
        .map(([choice_str_id, option]) => ({
            name: option.name,
            choice_str_id,
            price_delta: option.price_delta,
        }));

    res.status(200).send(validOptions);
});

// 3. Validate Full Configuration and Get Price
app.post('/product-templates/:template_str_id/validate-configuration', (req, res) => {
    const { template_str_id } = req.params;
    const { selections } = req.body;

    const validationError = validateRequestBody(['selections'], req.body);
    if (validationError) {
        return res.status(400).send({ error: validationError });
    }

    const template = templates[template_str_id];
    if (!template) {
        return res.status(404).send({ error: 'Template not found.' });
    }

    const errors = [];
    let totalPrice = template.base_price || 0;

    template.compatibilityRules.forEach((rule) => {
        if (rule.rule_type === 'REQUIRES' && selections[rule.primary_choice_str_id] === rule.primary_choice_str_id) {
            if (selections[rule.secondary_choice_str_id] !== rule.secondary_choice_str_id) {
                errors.push(`"${rule.primary_choice_str_id}" requires "${rule.secondary_choice_str_id}"`);
            }
        }
        if (rule.rule_type === 'INCOMPATIBLE_WITH' && selections[rule.primary_choice_str_id] === rule.primary_choice_str_id) {
            if (selections[rule.secondary_choice_str_id] === rule.secondary_choice_str_id) {
                errors.push(`"${rule.primary_choice_str_id}" is incompatible with "${rule.secondary_choice_str_id}"`);
            }
        }
    });

    if (errors.length > 0) {
        return res.status(400).send({ is_valid: false, errors });
    }

    Object.keys(selections).forEach((selection) => {
        const option = template.options[selection]?.[selections[selection]];
        if (option) {
            totalPrice += option.price_delta;
        }
    });

    res.status(200).send({ is_valid: true, total_price: totalPrice, selections });
});

// 4. Set Base Price for Template
app.post('/product-templates/:template_str_id/set-base-price', (req, res) => {
    const { template_str_id } = req.params;
    const { base_price } = req.body;

    const validationError = validateRequestBody(['base_price'], req.body);
    if (validationError) {
        return res.status(400).send({ error: validationError });
    }

    if (!templates[template_str_id]) {
        templates[template_str_id] = { compatibilityRules: [], options: {}, base_price: 0 };
    }

    templates[template_str_id].base_price = base_price;

    res.status(200).send({ message: 'Base price set successfully.' });
});

// 5. Add Options for a Category
app.post('/product-templates/:template_str_id/options/:category_str_id', (req, res) => {
    const { template_str_id, category_str_id } = req.params;
    const { options } = req.body;

    const validationError = validateRequestBody(['options'], req.body);
    if (validationError) {
        return res.status(400).send({ error: validationError });
    }

    if (!templates[template_str_id]) {
        templates[template_str_id] = { compatibilityRules: [], options: {}, base_price: 0 };
    }

    templates[template_str_id].options[category_str_id] = options;

    res.status(200).send({ message: 'Options added successfully.' });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
