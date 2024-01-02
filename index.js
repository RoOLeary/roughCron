const cron = require('node-cron');
const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js'); 

// Example URL of the XML feed
const xmlFeedUrl = 'https://example.com/jobs.xml';

// Function to fetch and parse the XML feed
async function fetchAndParseXml(url) {
    try {
        const response = await fetch(url);
        const xmlData = await response.text();
        return await parseStringPromise(xmlData);
    } catch (error) {
        console.error('Error fetching or parsing XML:', error);
        return null;
    }
}

let storedJobs = {};

async function checkForJobChanges(xmlData) {
    
    let changes = [];

    // Assuming xmlData is an object representing the parsed XML
    const jobs = xmlData.jobs; // Likely something like this

    for (const job of jobs) {
        const jobId = job.id[0];
        const jobStatus = job.status[0];

        if (!storedJobs[jobId]) {
            // New job
            changes.push({ id: jobId, type: 'new', data: job });
        } else if (storedJobs[jobId].status !== jobStatus || /* can include other conditions to check against */) {
            // Updated job
            changes.push({ id: jobId, type: 'updated', data: job });
        }
        // Update the stored job state
        storedJobs[jobId] = { ...job, status: jobStatus };
    }

    // Check for stopped jobs
    for (const id in storedJobs) {
        if (!jobs.some(job => job.id[0] === id)) {
            // Stopped job
            changes.push({ id: id, type: 'stopped' });
            delete storedJobs[id];
        }
    }
    return changes;
}

// Handle API calls based on the job change type
async function handleJobChange(jobChange) {
    try {
        let response;
        switch (jobChange.type) {
            case 'new':
                response = await fetch('https://api.jobboard.com/jobs', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(jobChange.data)
                });
                break;
            case 'updated':
                response = await fetch(`https://api.jobboard.com/jobs/${jobChange.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(jobChange.data)
                });
                break;
            case 'stopped':
                response = await fetch(`https://api.jobboard.com/jobs/${jobChange.id}`, {
                    method: 'DELETE'
                });
                break;
            default:
                return;
        }
        
    } catch (error) {
        console.error('Error', jobChange.id, ':', error);
    }
}

// Cron job to run every hour
cron.schedule('0 * * * *', async () => {
    const xmlData = await fetchAndParseXml(xmlFeedUrl);
    if (xmlData) {
        const jobChanges = await checkForJobChanges(xmlData);
        for (const jobChange of jobChanges) {
            await handleJobChange(jobChange);
        }
    }    
});
