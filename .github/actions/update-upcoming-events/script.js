const { Octokit } = require("octokit");


const { ReadmeBox } = require("readme-box");

const dayjs = require("dayjs");

const localizedFormat = require('dayjs/plugin/localizedFormat')
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone"); // depends on utc plugin

dayjs.extend(localizedFormat)
dayjs.extend(utc);
dayjs.extend(timezone);

// config
const repoName = process.env.REPOSITORY_NAME;
const [owner, repo] = repoName.split("/");
// manually set owner and repo below
//const owner = "manual";
//const repo = "manual";

//run();
createEventPages();

async function createEventPages() {
    const octokit = getOctokitConstructor();
    const issues = await fetchIssues(octokit);
    const upcomingEvents = getUpcomingEvents(issues);
    const eventPageMarkdown = makeEventPageMarkdown(upcomingEvents);

    const defaultBranch = await getDefaultBranch(octokit);
    const repoData = {owner, repo, defaultBranch};
    const shaData = await getShaData(octokit, repoData);
    console.log(shaData);
}

function makeEventPageMarkdown(events) {
    const boilerPlate = [
        //"# Welcome to the Southern California Nix Users Group",
        //"",
        //"We're a vibrant community centered around the Nix ecosystem. This group is for you if you're an experienced Nix developer, a Linux enthusiast, or someone who loves learning about cutting-edge technology!",
        //"",
        //"Our meetups are a forum for sharing knowledge, discussing challenges, and celebrating success within the world of Nix. We delve into topics such as package management, reproducible builds, and more.",
        //"",
        //"Each meetup features a presentation about a particular aspect of Nix, like advanced techniques, an introduction for beginners, or a real-world use case walkthrough.",
        //"",
    ];

    return events.map((event) => [
        "+++",
        `title = ${event.title}`,
        "[extra]",
        `organizer = ${event.user.login}`,
        `location = ${event.venue}`,
        `city = ${event.city}`,
        `event_date = ${event.date}`,
        `event_time = ${event.time}`,
        `event_link = ${event.link}`,
        "+++",
    ].join("\n"));
}

async function getDefaultBranch(octokit) {
    const response = await octokit.rest.repos.get({ owner, repo });
    return response.data.default_branch;
}

async function getShaData(octokit, repoData) {
    const response = await octokit.rest.repos.listCommits({
        owner: repoData.owner,
        repo: repoData.repo,
        sha: repoData.defaultBranch,
        per_page: 1
    });

    const latestCommitSha = response.data[0].sha;
    const treeSha = response.data[0].commit.tree.sha;

    return {latestCommitSha, treeSha};
}


async function run() {
    const octokit = getOctokitConstructor();
    const issues = await fetchIssues(octokit);
    const upcomingEvents = getUpcomingEvents(issues);
    const upcomingEventsText = makeUpcomingEventsText(upcomingEvents);
    const readmeMarkdown = makeReadmeMarkdown(upcomingEventsText);
    writeEventsToReadme(readmeMarkdown);
}

function getOctokitConstructor() {
    // Create Octokit constructor with custom user agent
    const octokit = new Octokit({
        auth: process.env.PERSONAL_ACCESS_TOKEN,
    });

    return octokit;
}

async function fetchIssues(octokit) {
    // load all open issues with the `event` label
    const issues = await octokit.paginate("GET /repos/{owner}/{repo}/issues", {
        owner,
        repo,
        labels: "event",
        state: "open",
        per_page: 100,
    });

    return issues;
};

function getUpcomingEvents(issues) {
    const upcomingEvents = issues.map((issue) => {
        const event = Object.fromEntries(
            issue.body
            .split("### ").filter(item => item)
            .map((elem) => {
                return elem.split("\n\n").filter(item => item);
            })
            .map(([key, value]) => [key.toLowerCase(), value])
        );

        const issueData = (
            ({title, number, html_url, user}) =>
            ({
                title,
                number,
                html_url,
                user:{
                    login: user["login"],
                    html_url: user["html_url"]
                }
            })
        )(issue);

        const datetime = dayjs([event.date, event.time].join(" "))
            .tz('America/Los_Angeles');

        return {...event, ...issueData, ...{datetime}};
    }).sort(eventSort);
    console.log(upcomingEvents);

    return upcomingEvents;
}

function makeUpcomingEventsText(upcomingEvents) {
    const upcomingEventsText = upcomingEvents.length
        ? upcomingEvents.map((event) => {
            return [
            "-",
            `[#${event.number}](${event.html_url})`,
            `[${event.venue}](${event.link})`,
            `in ${event.city}`,
            `on ${event.datetime.format('LLLL')}`,
            `championed by [@${event.user.login}](${event.user.html_url})`
            ].join(" ");
        }).join("\n")
        : "There are currently no upcoming events scheduled.";
    console.log(upcomingEventsText);

    return upcomingEventsText;
}

function makeReadmeMarkdown(upcomingEventsText) {
    const markdown =
        "## Join Socal Nug at an upcoming event\n\n"
        .concat(`${upcomingEventsText}`);

    console.log(markdown);

    return markdown;
}

async function writeEventsToReadme(markdown) {
    // update the upcoming events in the README
    await ReadmeBox.updateSection(markdown, {
      owner,
      repo,
      token: process.env.PERSONAL_ACCESS_TOKEN,
      section: "events",
      branch: "main",
      message: "Action: Update upcoming events.",
    });
    console.log("README updated in %s/%s", owner, repo);
}

function eventSort(a, b) {
    if (a.datetime.isAfter(b.datetime)) {
        return 1;
    }
    if (a.datetime.isBefore(b.datetime)) {
        return -1;
    }
    return 0;
}
