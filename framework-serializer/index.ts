import fs from "fs"
import path from "path"
const FOLDER_PATH = "/Users/harkiratsingh/Projects/mobile-magic-parent/nextjs-base-app"
// read through all the files in the folder and print them in tbe bolt artifact format
// It shoudl happen recursively

const files = fs.readdirSync(FOLDER_PATH)
let artifact = ""

function serializeFolder(folderPath: string) {
    const files = fs.readdirSync(folderPath)
    files.forEach(file => {
        const filePath = path.join(folderPath, file)
        if (fs.statSync(filePath).isDirectory()) {
            serializeFolder(filePath)
        } else {
            if (file.endsWith(".ico") || file.endsWith(".ttf") || file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".gif") || file.endsWith(".svg") || file.endsWith(".webp")) {
                return;
            }

            artifact += `<file name="${file}">`
        artifact += fs.readFileSync(filePath, {encoding: "utf-8"}).replaceAll("`", "\\`").replaceAll("$", "\\$")
            artifact += `</file>`
        }
    })
}

serializeFolder(FOLDER_PATH)

console.log(artifact)