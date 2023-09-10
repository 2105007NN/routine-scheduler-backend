import pdf from "pdf-creator-node";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import admin from 'firebase-admin';
import { serviceAccount } from '../../pvtkey.js';
import { routineForLvl, routineForTeacher ,routineForRoom} from './repository.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dayOrder = {
    Saturday: 0,
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6,
};


var options = {
    format: "A3",
    orientation: "landscape",
    border: "10mm",
    header: {
        height: "45mm",
        contents: '<div style="text-align: center;">Author: AA Fahad</div>'
    },
    footer: {
        height: "28mm",
        contents: {
            first: 'Cover page',
            2: 'Second page', // Any page number is working. 1-based index
            default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
            last: 'Last Page'
        }
    }
};

function sortedData(datas) { //sort by day
    var sortedDatas = [];
    var keys = Object.keys(datas)
    var len = keys.length;

    keys.sort(function (a, b) { return dayOrder[a] - dayOrder[b] });

    for (var i = 0; i < len; i++) {
        var k = keys[i];
        sortedDatas[k] = datas[k];
    }
    return sortedDatas;
}

function mergedAppointments(sectionAAppointments) { //merge teacher
    const mergedAppointments = [];

    sectionAAppointments.forEach(day => {
        day.appointments.forEach(appointment => {
            // Find if there's an existing appointment with same attributes (except 'initial')
            const existingAppointmentIndex = mergedAppointments.findIndex(existing => (
                existing.day === day.day &&
                existing.appointments[0].time === appointment.time &&
                existing.appointments[0].room === appointment.room &&
                existing.appointments[0].course_id === appointment.course_id &&
                existing.appointments[0].section === appointment.section
            ));

            if (existingAppointmentIndex !== -1) {
                // Merge 'initial' values
                mergedAppointments[existingAppointmentIndex].appointments[0].initial += `/${appointment.initial}`;
            } else {
                // Create a new appointment
                mergedAppointments.push({
                    day: day.day,
                    appointments: [{
                        time: appointment.time,
                        initial: appointment.initial,
                        room: appointment.room,
                        course_id: appointment.course_id,
                        section: appointment.section
                    }]
                });
            }
        });
    });

    const MergedAppointmentsA = mergedAppointments.reduce((acc, curr) => {
        const existingDay = acc.find(item => item.day === curr.day);
        if (existingDay) {
            existingDay.appointments.push(...curr.appointments);
        } else {
            acc.push(curr);
        }
        return acc;
    }, []);

    return MergedAppointmentsA;
}

async function generateData(rows) {
    var datas = [];
    rows.forEach(obj => {
        const { day, time, initial, room, course_id, section } = obj;

        if (!datas[day]) {
            datas[day] = [];
        }

        datas[day].push({ time, initial, room, course_id, section });
    });
    var sortedDatas = sortedData(datas);





    const sectionAAppointments = [];
    const sectionBAppointments = [];

    for (const day in sortedDatas) {
        const appointments = sortedDatas[day];
        const sectionA = [];
        const sectionB = [];

        for (const appointment of appointments) {
            if (appointment.section === 'A') {
                sectionA.push(appointment);
            } else if (appointment.section === 'B') {
                sectionB.push(appointment);
            }
        }

        if (sectionA.length > 0) {
            sectionAAppointments.push({ day, appointments: sectionA });
        }

        if (sectionB.length > 0) {
            sectionBAppointments.push({ day, appointments: sectionB });
        }
    }

    const mergedAppointmentsA = mergedAppointments(sectionAAppointments);
    const mergedAppointmentsB = mergedAppointments(sectionBAppointments);

    return { mergedAppointmentsA, mergedAppointmentsB };


    //return { sectionAAppointments, sectionBAppointments };
}
async function createPDFStd(datas, lvlTerm, section) {
    //fetch template
    var html = fs.readFileSync(path.resolve(__dirname, 'templateStudent.html'), 'utf8');
    //create output directory
    var outputDir = path.resolve(__dirname, lvlTerm + '_' + section + '.pdf');

    var document = {
        html: html,
        data: {
            lvlTerm: lvlTerm,
            section: section,
            days: datas
        },
        path: outputDir,
        type: "",
    };
    pdf
        .create(document, options)
        .then((stat) => {
            console.log(stat);
        })
        .catch((error) => {
            console.error(error);
        });
}

export async function generatePDF(req, res, next) {
    const lvlTerm = req.params.lvlTerm;

    try {
        const rows = await routineForLvl(lvlTerm);
        if (rows.length === 0) {
            res.status(404).json({ message: "No data found" })
        } else {

            const { mergedAppointmentsA, mergedAppointmentsB } = await generateData(rows);

            await createPDFStd(mergedAppointmentsA, lvlTerm, 'A');
            await createPDFStd(mergedAppointmentsB, lvlTerm, 'B');

            res.status(200).json({ message: "PDF generated" })
        }

    }
    catch (err) {
        next(err)
    }
}


//////Teacher PDF
async function generateDataTeacher(rows) {
    var datas = [];
    rows.forEach(obj => {
        const { day, time, room, course_id, section, level_term } = obj;

        if (!datas[day]) {
            datas[day] = [];
        }

        datas[day].push({ time, room, course_id, section, level_term });
    });

    var sortedDatas = sortedData(datas);



    const teacherAppointments = [];


    for (const day in sortedDatas) {
        const appointments = datas[day];
        const value = [];

        for (const appointment of appointments) {
            value.push(appointment);
        }

        if (value.length > 0) {
            teacherAppointments.push({ day, appointments: value });
        }


    }

    return teacherAppointments;
}

async function createPDFTeacher(datas, initial) {
    var html = fs.readFileSync(path.resolve(__dirname, 'templateTeacher.html'), 'utf8');
    //create output directory
    var outputDir = path.resolve(__dirname, 'routine_' + initial + '.pdf');

    var document = {
        html: html,
        data: {
            initial: initial,
            days: datas
        },
        path: outputDir,
        type: "",
    };
    pdf
        .create(document, options)
        .then((stat) => {
            console.log(stat);
        })
        .catch((error) => {
            console.error(error);
        });
}


export async function teacherPDF(req, res, next) {
    const initial = req.params.initial;

    try {
        const rows = await routineForTeacher(initial);
        if (rows.length === 0) {
            res.status(404).json({ message: "No data found" })
        } else {
            const data = await generateDataTeacher(rows);
            await createPDFTeacher(data, initial);

            res.status(200).json({ message: "PDF generated" })
        }


    } catch (err) {
        next(err)
    }
}


//////Room PDF
async function generateDataRoom(rows) {
    var datas = [];
    rows.forEach(obj => {
        const { day, time, initial, course_id, section, level_term } = obj;

        if (!datas[day]) {
            datas[day] = [];
        }

        datas[day].push({ time, initial, course_id, section, level_term });
    });

    var sortedDatas = sortedData(datas);



    const roomAppointments = [];


    for (const day in sortedDatas) {
        const appointments = datas[day];
        const value = [];

        for (const appointment of appointments) {
            value.push(appointment);
        }

        if (value.length > 0) {
            roomAppointments.push({ day, appointments: value });
        }


    }

    return roomAppointments;
}
async function createPDFRoom(datas, room) {
    var html = fs.readFileSync(path.resolve(__dirname, 'templateRoom.html'), 'utf8');
    //create output directory
    var outputDir = path.resolve(__dirname, 'routine_' + room + '.pdf');

    var document = {
        html: html,
        data: {
            room: room,
            days: datas
        },
        path: outputDir,
        type: "",
    };
    pdf
        .create(document, options)
        .then((stat) => {
            console.log(stat);
        })
        .catch((error) => {
            console.error(error);
        });
}
export async function roomPDF(req, res, next) {
    const room = req.params.room;

    try {
        const rows = await routineForRoom(room);
        
        if (rows.length === 0) {
            res.status(404).json({ message: "No data found" })
        }
        else { 
            const data = await generateDataRoom(rows);
            const mergedData = mergedAppointments(data);
           await createPDFRoom(mergedData, room);
            res.status(200).json({ message: mergedData })
        }



    } catch (err) {
        next(err)
    }
}


//initialize the app
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(JSON.stringify(serviceAccount))),
    storageBucket: 'gs://routineschedule-cd03a.appspot.com' //you can find in storage.
});

//get bucket
var bucket = admin.storage().bucket();

//function to upload file
async function uploadFile(filepath, filename) {
    await bucket.upload(filepath, {
        gzip: true,
        destination: filename,
        metadata: {
            cacheControl: 'public, max-age=31536000'
        }
    });

    console.log(`${filename} uploaded to bucket.`);
}

//function to get url

async function generateSignedUrl(filename) {
    const options = {
        version: 'v2',
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60
    };

    const [url] = await bucket.file(filename).getSignedUrl(options);
    // console.log(url);
    return url;
};

// var filepath = outputDir;
var filename = 'test.pdf' //can be anything, it will be the name with which it will be uploded to the firebase storage.


export async function uploadPDF(req, res) {
    // uploadFile(filepath, filename)
    const url = await generateSignedUrl(filename)
    res.status(200).json({ url: url })
}