import { Configuration, OpenAIApi } from "openai";
const { DocumentProcessorServiceClient } =
  require("@google-cloud/documentai").v1beta3;
import { google } from "@google-cloud/documentai/build/protos/protos";
import fs from "fs/promises"; // Changed fs import to use promises
import PDFParser from "pdf-parse";
import randomstring from "randomstring";
import * as dotenv from "dotenv";

dotenv.config();

const configuration = new Configuration({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new DocumentProcessorServiceClient();
const openai = new OpenAIApi(configuration);

const extractTextFromPDF = async (pdfpath: string): Promise<string> => {
  try {
    const pdfData = await fs.readFile(pdfpath); // Changed to use fs.readFile with promises
    const parsedPDF = await PDFParser(pdfData);
    const containsText = parsedPDF.text.trim().length > 0;

    if (containsText) {
      // The PDF contains text, so we can use pdf-parse to extract it
      return parsedPDF.text;
    } else {
      return performOCR(pdfpath);
    }
  } catch (error) {
    console.error(error);
    throw new Error("Error while extracting text from PDF");
  }
};

const performOCR = async (pdfpath: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      const pdfData = await fs.readFile(pdfpath);
      const parsedPDF = await PDFParser(pdfData);
      const name = `projects/${process.env.GCLOUD_PROJECT_ID}/locations/${process.env.GCLOUD_LOCATION}/processors/${process.env.GCLOUD_PROCESSOR_ID}`;
      const imageFile = await fs.readFile(pdfpath);
      const encodedImage = Buffer.from(imageFile).toString("base64");

      if (parsedPDF.numpages > 15) {
        throw new Error("The PDF has more than 15 pages");
      }

      const request = {
        name,
        rawDocument: {
          content: encodedImage,
          mimeType: "application/pdf",
        },
      };

      const [result] = await client.processDocument(request);
      const {
        document: { text },
      } = result;

      resolve(text);
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
};

/*
Chunk text into parts of 10000 characters or less
*/
const chunkText = (prompt: string, splitLength: number): FilePart[] => {
  let fileData: FilePart[] = [];
  if (prompt && !isNaN(splitLength)) {
    fileData = splitPrompt(prompt, splitLength);
  }
  return fileData;
};

interface FilePart {
  name: string;
  content: string;
}

const splitPrompt = (text: string, splitLength: number = 10000): FilePart[] => {
  if (splitLength <= 0) {
    throw new Error("Max length must be greater than 0.");
  }

  const numParts = Math.ceil(text.length / splitLength);
  const fileData: FilePart[] = [];

  for (let i = 0; i < numParts; i++) {
    const start = i * splitLength;
    const end = Math.min((i + 1) * splitLength, text.length);

    let content = "";
    if (i === numParts - 1) {
      content = `[START PART ${i + 1}/${numParts}]\n${text.slice(
        start,
        end
      )}\n[END PART ${
        i + 1
      }/${numParts}]\nALL PARTS SENT. Now you can continue processing the request.`;
    } else {
      content = `Do not answer yet. This is just another part of the text I want to send you. Just receive and acknowledge as "Part ${
        i + 1
      }/${numParts} received" and wait for the next part.\n[START PART ${
        i + 1
      }/${numParts}]\n${text.slice(start, end)}\n[END PART ${
        i + 1
      }/${numParts}]\nRemember not answering yet. Just acknowledge you received this part with the message "Part ${
        i + 1
      }/${numParts} received" and wait for the next part.`;
    }

    const fileName = `split_${String(i + 1).padStart(3, "0")}_of_${String(
      numParts
    ).padStart(3, "0")}.txt`;

    fileData.push({
      name: fileName,
      content,
    });
  }

  return fileData;
};

const pdfData: Promise<any> = extractTextFromPDF("./pdfs/word-pdf.pdf").then(
  (text) => {
    const res = chunkText(text, 10000);
    console.log(res);
  }
);

// TODO: Implement chatgpt section to iterate and loop through FileData[].

// const chatGPTPrompt = async (message: string) => {
//   const InitialInstructionResponse = await openai.complete({
//     engine: "text-davinci-003",
//     prompt: INITIAL_INSTRUCTION,
//     maxTokens: 4000,
//   });
//   console.log(InitialInstructionResponse.data);
// };
