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

createEventPages();
//run();

async function createEventPages() {
    const octokit = getOctokitConstructor();
    const issues = await fetchIssues(octokit);

    const eventReadmeTree = await makeEventReadmeTree(octokit, issues);
    const eventPagesTree = await makeEventPagesTree(octokit, issues);
    const treeContent = [...eventPagesTree, ...eventReadmeTree];
    //console.log(treeContent);

    await commitChanges(octokit, treeContent);
}

async function makeEventPagesTree(octokit, issues) {
    const upcomingEvents = getUpcomingEvents(issues);

    const eventPages = makeEventPageMarkdown(upcomingEvents);

    const treeContent = eventPages.map((event) => {
        const filename = makeEventPageFilename(event);
        return {
            path: `content/events/${filename}`,
            mode: "100644",
            type: "blob",
            content: `${ event.markdown }`,
        };
    });

    return treeContent;
}

async function makeEventReadmeTree(octokit, issues) {
    const upcomingEvents = getUpcomingEvents(issues);
    const eventsReadmeMarkdown = makeEventReadmeMarkdown(upcomingEvents);

    const readme = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: "README.md",
    });
    const readmeOpts = {
        oldContents: Buffer.from(readme.data.content, "base64").toString("utf8"),
        newContents: eventsReadmeMarkdown,
        section: "events",
    };

    const newSection = replaceSection(readmeOpts);

    return [{
        path: "README.md",
        mode: "100644",
        type: "blob",
        content: newSection,
    }];
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

    return events.map((event) => {
        return {
            data: event,
            markdown: [
                "+++",
                `title = "${event.name}"`,
                "[extra]",
                `organizer = "${event.user.login}"`,
                `location = "${event.venue}"`,
                `city = "${event.city}"`,
                `event_date = "${event.date}"`,
                `event_time = "${event.time}"`,
                `event_link = "${event.link}"`,
                `event_issue_number = "${event.number}"`,
                "+++",
            ].join("\n")
        }
    });
}

async function commitChanges(octokit, treeContent) {

    const defaultBranch = await getDefaultBranch(octokit);
    const repoData = {owner, repo, defaultBranch};
    const shaData = await getShaData(octokit, repoData);
    const commitData = {
        author: {
            name: "Daniel Baker",
            email: "daniel.n.baker@gmail.com",
        },
        branch: "action-event-update",
        message: "Action: update events pages.",
        title: "Action: Update Events Pages",
    };

    const simpleTree = await octokit.rest.git.createTree({
        owner,
        repo,
        tree: treeContent,
        base_tree: shaData.treeSha,
    });

    const simpleCommit = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitData.message,
        tree: simpleTree.data.sha,
        parents: [shaData.latestCommitSha],
        author: commitData.author,
    });
    //console.log(simpleCommit);

    const simpleRef = await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${commitData.branch}`,
        sha: simpleCommit.data.sha,
    });
    console.log(simpleRef);

    const commitCompare = await octokit.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `main...${commitData.branch}`,
    });
    //console.log(commitCompare);

    if (commitCompare.data.files.length === 0) {
        const removedRef = await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${commitData.branch}`,
        });
        console.log(removedRef);
    } else {
        const simplePull = await octokit.rest.pulls.create({
            owner,
            repo,
            title: `${commitData.title}`,
            head: `${commitData.branch}`,
            base: "main",
        });
        console.log(simplePull);
    }
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

function makeEventPageFilename(event) {
    return `${event.data.datetime.format('YYYY-MM-DD')}--${event.data.name}--${event.data.number}.md`;
}


async function run() {
    const octokit = getOctokitConstructor();
    const issues = await fetchIssues(octokit);
    const upcomingEvents = getUpcomingEvents(issues);
    const upcomingEventsText = makeEventReadmeMarkdown(upcomingEvents);
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
                return elem.split(/[\r]?\n[\r]?\n/).filter(item => item);
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
    //console.log(upcomingEvents);

    return upcomingEvents;
}

function makeEventReadmeMarkdown(upcomingEvents) {
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

    const markdown =
        "## Join Socal Nug at an upcoming event\n\n"
        .concat(`${upcomingEventsText}`);

    return markdown;
}

function replaceSection(opts) {
    const { regex, start, end } = createRegExp(opts.section)

    if (!regex.test(opts.oldContents)) {
      throw new Error(
        `Contents do not contain start/end comments for section "${opts.section}"`
      )
    }

    const newContentsWithComments = `${start}\n${opts.newContents}\n${end}`
    return opts.oldContents.replace(regex, newContentsWithComments)
  }


function createRegExp(section) {
    const start = `<!--START_SECTION:${section}-->`
    const end = `<!--END_SECTION:${section}-->`
    const regex = new RegExp(`${start}\n(?:(?<content>[\\s\\S]+)\n)?${end}`)
    return { regex, start, end }
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
    //console.log("README updated in %s/%s", owner, repo);
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
