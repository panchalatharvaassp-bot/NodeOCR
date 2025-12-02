/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/http', 'N/log'], (http, log) => {

    function execute() {
        try {

            const payload = {
                filePath: "./Chelsea_Sample_Inovice_1.pdf" // same as Postman
            };

            const response = http.post({
                url: 'http://localhost:3000/parse',
                body: JSON.stringify(payload),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            log.audit('Response Status', response.code);
            log.audit('Response Body', response.body);

        } catch (err) {
            log.error('Scheduled Script Error', err);
        }
    }

    return { execute };
});
